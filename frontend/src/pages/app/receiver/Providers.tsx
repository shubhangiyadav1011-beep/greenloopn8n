import PageMeta from "@/components/common/PageMeta";
import MatchDetailsPanel from "@/components/greenloop/MatchDetailsPanel";
import AuctionsBoard from "@/components/auctions/AuctionsBoard";
import SearchFilterBar from "@/components/greenloop/SearchFilterBar";
import StatusBadge from "@/components/greenloop/StatusBadge";
import { materialMediaFor, ambientMedia } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import ReceiverCheckoutModal from "@/components/greenloop/ReceiverCheckoutModal";
import MaterialPassportDrawer from "@/components/greenloop/MaterialPassportDrawer";
import { contextualMatch } from "@shared/domain/capacity";
import type { AllocationCandidate, MaterialCondition, MaterialPassport, MaterialTypeKey, Project, ProviderMaterialListing } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatINRPerT, materialTypeLabel } from "@/utils";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

const types: MaterialTypeKey[] = ["concrete", "brick", "steel", "timber", "plasterboard", "glass"];
const conditions: MaterialCondition[] = ["good", "fair", "poor"];

type SortKey = "best-match" | "newest" | "quantity" | "price-asc" | "price-desc";
type ViewMode = "grid" | "list";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "best-match", label: "Best match (recommended)" },
  { id: "newest", label: "Newest" },
  { id: "quantity", label: "Largest quantity" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/** "Ready now" while stock is ample, "Limited quantity" once it runs low. */
function stockStatus(listing: { availableT: number; availableFrom?: string }): { label: string; tone: "green" | "amber" } {
  if (listing.availableFrom) return { label: "Coming soon", tone: "amber" };
  return listing.availableT > 0 && listing.availableT <= 5
    ? { label: "Limited quantity", tone: "amber" }
    : { label: "Ready now", tone: "green" };
}


function StatIcon({ kind }: { kind: "providers" | "records" | "tonnes" }) {
  const paths = {
    providers: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.6a3.2 3.2 0 0 1 0 4.8M17.6 14.3c1.6.8 2.6 2.4 2.9 4.7" /></>,
    records: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    tonnes: <><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="M4 12v5l8 4.5 8-4.5v-5" /><path d="M12 16.5V21" /></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      {paths[kind]}
    </svg>
  );
}

export default function Providers() {
  const { t } = useTranslation();
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const receiverId = user?.receiverId ?? "";
  const reduceMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: "providers" | "sent" | "received" | "auctions" =
    rawTab === "sent" || rawTab === "received" || rawTab === "auctions" ? rawTab : "providers";
  const [activeTab, setActiveTab] = useState<"providers" | "sent" | "received" | "auctions">(initialTab);

  const [type, setType] = useState<string>((searchParams.get("materialType") as string) || "");
  const [location, setLocation] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState(searchParams.get("quantityT") || "");
  const [maximumQuantity, setMaximumQuantity] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState(searchParams.get("budgetPerT") || "");
  const [availableBy, setAvailableBy] = useState(searchParams.get("neededBy") || "");
  const [condition, setCondition] = useState(searchParams.get("condition") || "");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("best-match");
  const [view, setView] = useState<ViewMode>("grid");
  const [distanceTier, setDistanceTier] = useState<string>(searchParams.get("maxDistance") || "");

  // Synchronize filter state when query parameters change (e.g. from Demand, Details, Dashboard)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["providers", "sent", "received", "auctions"].includes(tabParam)) {
      setActiveTab(tabParam as "providers" | "sent" | "received" | "auctions");
    }
    const matTypeParam = searchParams.get("materialType");
    if (matTypeParam !== null) setType(matTypeParam);
    const qtyParam = searchParams.get("quantityT");
    if (qtyParam !== null) setMinimumQuantity(qtyParam);
    const budgetParam = searchParams.get("budgetPerT");
    if (budgetParam !== null) setMaximumPrice(budgetParam);
    const conditionParam = searchParams.get("condition");
    if (conditionParam !== null) setCondition(conditionParam);
    const dateParam = searchParams.get("neededBy");
    if (dateParam !== null) setAvailableBy(dateParam);
    const maxDistParam = searchParams.get("maxDistance");
    if (maxDistParam !== null) setDistanceTier(maxDistParam);
  }, [searchParams]);
  const [selectedListingForOrder, setSelectedListingForOrder] = useState<ProviderMaterialListing | null>(null);
  const [activePassportListing, setActivePassportListing] = useState<ProviderMaterialListing | null>(null);
  const listings = useMemo(() => dataset.providerListings ?? [], [dataset.providerListings]);

  // Sync with ?passport= query param if present
  useEffect(() => {
    const passportParam = searchParams.get("passport");
    if (passportParam && listings.length > 0) {
      const match = listings.find((l) => l.materialId === passportParam);
      if (match && (!activePassportListing || activePassportListing.materialId !== match.materialId)) {
        setActivePassportListing(match);
      }
    }
  }, [searchParams, listings, activePassportListing]);

  const activePassportMaterial = useMemo<MaterialPassport | null>(() => {
    if (!activePassportListing) return null;
    const existing = dataset.materials?.find((m) => m.id === activePassportListing.materialId);
    if (existing) {
      return {
        ...existing,
        pricePerT: activePassportListing.pricePerT ?? existing.pricePerT,
        quantityT: activePassportListing.quantityT || existing.quantityT,
        availableFrom: activePassportListing.availableFrom ?? existing.availableFrom,
        verificationStatus: activePassportListing.verificationStatus ?? existing.verificationStatus,
      };
    }
    return {
      id: activePassportListing.materialId,
      projectId: activePassportListing.projectId,
      type: activePassportListing.materialType,
      quantityT: activePassportListing.quantityT || activePassportListing.availableT,
      quantityRangeT: activePassportListing.quantityRangeT || [
        activePassportListing.availableT * 0.9,
        activePassportListing.availableT * 1.1,
      ],
      condition: activePassportListing.condition,
      grade: activePassportListing.grade,
      surveyedAt: new Date().toISOString(),
      status: (activePassportListing.verificationStatus === "verified" ? "verified" : "available") as any,
      confidence: activePassportListing.confidence ?? 0.95,
      surveyNotes: activePassportListing.surveyNotes,
      evidence: activePassportListing.evidence || [],
      pricePerT: activePassportListing.pricePerT,
      availableFrom: activePassportListing.availableFrom,
      geo: activePassportListing.geo,
      listingStatus: activePassportListing.listingStatus || "published",
      name: activePassportListing.name,
      dimensions: activePassportListing.dimensions,
      provenance: activePassportListing.provenance,
      verificationStatus: activePassportListing.verificationStatus || "verified",
    };
  }, [activePassportListing, dataset.materials]);

  const activePassportProject = useMemo<Project | undefined>(() => {
    if (!activePassportListing) return undefined;
    const existing = dataset.projects?.find((p) => p.id === activePassportListing.projectId);
    if (existing) return existing;
    return {
      id: activePassportListing.projectId || "P-ref",
      name: activePassportListing.projectName || "Project 1",
      location: activePassportListing.projectLocation || activePassportListing.location || "Delhi",
      status: "active" as any,
      surveyedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
  }, [activePassportListing, dataset.projects]);

  const providers = useMemo(() => [...new Set(listings.map((listing) => listing.organization))], [listings]);
  const invalidQuantityValue = [minimumQuantity, maximumQuantity].some((value) => value !== "" && Number(value) < 0);
  const invalidPriceValue = [minimumPrice, maximumPrice].some((value) => value !== "" && Number(value) < 0);
  const invalidQuantityRange = !invalidQuantityValue && minimumQuantity !== "" && maximumQuantity !== "" && Number(minimumQuantity) > Number(maximumQuantity);
  const invalidPriceRange = !invalidPriceValue && minimumPrice !== "" && maximumPrice !== "" && Number(minimumPrice) > Number(maximumPrice);
  const handleMaterialSearchChange = (value: string) => {
    setMaterialSearch(value);
    const exactType = listings.find((listing) => listing.materialType.toLowerCase() === value.trim().toLowerCase())?.materialType;
    setType(exactType ?? "");
  };
  const filteredListings = useMemo(() => listings.filter((listing) => {
    const locationQuery = location.trim().toLowerCase();
    const materialQuery = materialSearch.trim().toLowerCase();
    const matchesDistanceTier = !distanceTier
      ? true
      : distanceTier === "25"
        ? (listing.location.toLowerCase().includes("pune") || listing.projectLocation.toLowerCase().includes("pune") || listing.location.toLowerCase().includes("chakan"))
        : distanceTier === "50"
          ? (listing.location.toLowerCase().includes("pune") || listing.location.toLowerCase().includes("mumbai") || listing.location.toLowerCase().includes("chakan") || listing.location.toLowerCase().includes("panvel"))
          : true;
    return (!type || listing.materialType === type)
      && (!materialQuery || `${listing.materialType} ${listing.grade}`.toLowerCase().includes(materialQuery))
      && (!locationQuery || `${listing.location} ${listing.projectLocation}`.toLowerCase().includes(locationQuery))
      && matchesDistanceTier
      && (invalidQuantityValue || invalidQuantityRange || !minimumQuantity || listing.availableT >= Number(minimumQuantity))
      && (invalidQuantityValue || invalidQuantityRange || !maximumQuantity || listing.availableT <= Number(maximumQuantity))
      && (invalidPriceValue || invalidPriceRange || !minimumPrice || listing.pricePerT !== undefined && listing.pricePerT >= Number(minimumPrice))
      && (invalidPriceValue || invalidPriceRange || !maximumPrice || listing.pricePerT !== undefined && listing.pricePerT <= Number(maximumPrice))
      && (!availableBy || !listing.availableFrom || listing.availableFrom <= availableBy)
      && (!condition || listing.condition === condition)
      && (!verificationFilter || (verificationFilter === "verified" ? listing.verificationStatus === "verified" : verificationFilter === "evidence" ? Boolean(listing.evidence && listing.evidence.length > 0) : true));
  }), [listings, type, materialSearch, location, distanceTier, minimumQuantity, maximumQuantity, minimumPrice, maximumPrice, availableBy, condition, verificationFilter, invalidQuantityValue, invalidPriceValue, invalidQuantityRange, invalidPriceRange]);
  const currentReceiver = useMemo(() => {
    return dataset.receivers?.find((r) => r.id === receiverId) || {
      id: receiverId || "R-default",
      name: user?.organization || user?.name || "Apex Receiver Facility",
      location: user?.location || "Pune",
      dailyIntakeT: 100,
      currentStockT: 20,
      acceptedTypes: types,
      distanceKm: 25,
      distanceKnown: true,
    };
  }, [dataset.receivers, receiverId, user]);

  // Automatic background contextual match scoring for all candidate provider materials
  const receiverContextMatches = useMemo(() => {
    const candidates = contextualMatch(
      dataset,
      { receiverId: currentReceiver.id },
      {
        materialType: type ? (type as MaterialTypeKey) : undefined,
        requiredQuantityT: minimumQuantity ? Number(minimumQuantity) : undefined,
        maximumBudget: maximumPrice ? Number(maximumPrice) : undefined,
        requiredCondition: condition ? (condition as MaterialCondition) : undefined,
        neededBy: availableBy || undefined,
        maxDistanceKm: distanceTier ? Number(distanceTier) : undefined,
        requireVerifiedPassport: verificationFilter === "verified",
        requireEvidence: verificationFilter === "evidence",
      }
    );
    const map = new Map<string, AllocationCandidate>();
    for (const c of candidates) {
      if (c.materialId) {
        map.set(c.materialId, c);
      }
    }
    return map;
  }, [dataset, currentReceiver, type, minimumQuantity, maximumPrice, condition, availableBy, distanceTier, verificationFilter]);

  const sortedListings = useMemo(() => [...filteredListings].sort((a, b) => {
    const placement = Number(Boolean(b.sponsored)) - Number(Boolean(a.sponsored)) || Number(Boolean(b.premium)) - Number(Boolean(a.premium));

    if (sortBy === "best-match") {
      const matchA = receiverContextMatches.get(a.materialId);
      const matchB = receiverContextMatches.get(b.materialId);

      // Mandatory eligibility checks: Ineligible materials never outrank eligible options
      const isEligibleA = matchA ? matchA.isEligible : (a.availableT > 0 && a.listingStatus !== "paused" && a.listingStatus !== "archived");
      const isEligibleB = matchB ? matchB.isEligible : (b.availableT > 0 && b.listingStatus !== "paused" && b.listingStatus !== "archived");

      if (isEligibleA !== isEligibleB) {
        return isEligibleA ? -1 : 1;
      }

      // Rank by calculated suitability score
      const scoreA = matchA?.score ?? (a.verificationStatus === "verified" ? 0.8 : 0.6);
      const scoreB = matchB?.score ?? (b.verificationStatus === "verified" ? 0.8 : 0.6);

      if (Math.abs(scoreB - scoreA) > 0.005) {
        return scoreB - scoreA;
      }

      // Distance / transit proximity tie-break
      if (matchA && matchB && matchA.distanceKm !== matchB.distanceKm) {
        return matchA.distanceKm - matchB.distanceKm;
      }

      // Verified evidence badge tie-break
      const verifiedDiff = (b.verificationStatus === "verified" ? 1 : 0) - (a.verificationStatus === "verified" ? 1 : 0);
      if (verifiedDiff !== 0) return verifiedDiff;

      // Ready now before Coming soon
      const readyDiff = (a.availableFrom ? 0 : 1) - (b.availableFrom ? 0 : 1);
      if (readyDiff !== 0) return readyDiff;

      return placement || b.availableT - a.availableT || a.materialId.localeCompare(b.materialId);
    }

    if (sortBy === "quantity") return b.availableT - a.availableT || placement || a.materialId.localeCompare(b.materialId);
    if (sortBy === "price-asc") return (a.pricePerT ?? Number.POSITIVE_INFINITY) - (b.pricePerT ?? Number.POSITIVE_INFINITY) || placement || a.materialId.localeCompare(b.materialId);
    if (sortBy === "price-desc") return (b.pricePerT ?? -1) - (a.pricePerT ?? -1) || placement || a.materialId.localeCompare(b.materialId);

    const av = a.availableFrom ?? "";
    const bv = b.availableFrom ?? "";
    if (av !== bv) return av.localeCompare(bv);
    return placement || b.materialId.localeCompare(a.materialId);
  }), [filteredListings, sortBy, receiverContextMatches]);

  const totalAvailableT = useMemo(() => listings.reduce((sum, listing) => sum + listing.availableT, 0), [listings]);

  const activeFilterCount = [type, location, minimumQuantity, maximumQuantity, minimumPrice, maximumPrice, availableBy, condition, verificationFilter].filter(Boolean).length;

  const myRequests = useMemo(() => dataset.demands?.filter((d) => d.receiverId === receiverId && d.targetProviderId) ?? [], [dataset.demands, receiverId]);
  const filteredMyRequests = useMemo(() => myRequests.filter((d) => {
    const locationQuery = location.trim().toLowerCase();
    const provider = dataset.providerListings?.find(l => l.materialId === d.targetMaterialId);
    return (!type || d.materialType === type)
      && (!locationQuery || `${d.location} ${provider?.organization}`.toLowerCase().includes(locationQuery))
      && (!minimumQuantity || d.requiredT >= Number(minimumQuantity))
      && (!maximumPrice || (d.budgetPerT !== undefined && d.budgetPerT <= Number(maximumPrice)))
      && (!availableBy || !d.period || d.period <= availableBy);
  }), [myRequests, type, location, minimumQuantity, maximumPrice, availableBy, dataset.providerListings]);

  const sortedMyRequests = useMemo(() => {
    return [...filteredMyRequests].sort((a, b) => {
      const statusOrder: Record<string, number> = { OPEN: 0, PARTIALLY_COVERED: 1, FULFILLED: 2, CANCELLED: 3 };
      const orderDiff = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
      if (orderDiff !== 0) return orderDiff;
      return (b.requiredT || 0) - (a.requiredT || 0);
    });
  }, [filteredMyRequests]);

  const myOffers = useMemo(() => dataset.offers?.filter((o) => {
    if (o.auctionId) return false;
    const demand = dataset.demands?.find((d) => d.id === o.demandId);
    return demand?.receiverId === receiverId;
  }) ?? [], [dataset.offers, dataset.demands, receiverId]);
  const filteredMyOffers = useMemo(() => myOffers.filter((o) => {
    const demand = dataset.demands?.find((d) => d.id === o.demandId);
    if (!demand) return false;
    const locationQuery = location.trim().toLowerCase();
    const provider = dataset.providerListings?.find(l => l.providerId === o.providerId);
    return (!type || demand.materialType === type)
      && (!locationQuery || `${demand.location} ${provider?.organization}`.toLowerCase().includes(locationQuery))
      && (!minimumQuantity || o.offeredQuantityT >= Number(minimumQuantity))
      && (!maximumPrice || (o.pricePerT !== undefined && o.pricePerT <= Number(maximumPrice)));
  }), [myOffers, dataset.demands, type, location, minimumQuantity, maximumPrice, dataset.providerListings]);

  const sortedMyOffers = useMemo(() => {
    return [...filteredMyOffers].sort((a, b) => {
      const demandA = dataset.demands?.find((d) => d.id === a.demandId);
      const demandB = dataset.demands?.find((d) => d.id === b.demandId);
      const candA = demandA ? contextualMatch(dataset, { demandId: demandA.id, offerId: a.id })[0] : undefined;
      const candB = demandB ? contextualMatch(dataset, { demandId: demandB.id, offerId: b.id })[0] : undefined;

      const eligA = candA?.isEligible ?? true;
      const eligB = candB?.isEligible ?? true;
      if (eligA !== eligB) return eligA ? -1 : 1;

      const scoreA = candA?.score ?? 0;
      const scoreB = candB?.score ?? 0;
      return scoreB - scoreA;
    });
  }, [filteredMyOffers, dataset]);

  return (
    <div className="pb-16">
      <PageMeta title="Providers | GreenLoop" description="Browse available recovered materials from GreenLoop providers." />

      {/* ---------------------------------------------------------- */}
      {/* Cinematic hero — Receiver Workspace / Provider Directory    */}
      {/* ---------------------------------------------------------- */}
      <section className="relative isolate" aria-labelledby="provider-directory-title">
        <div className="relative h-[320px] overflow-hidden sm:h-[340px] lg:h-[360px]">
          <img
            src={ambientMedia.surveyHero.src}
            alt={ambientMedia.surveyHero.alt}
            className={`absolute inset-0 size-full object-cover ${reduceMotion ? "" : "motion-safe:animate-gl-hero-zoom"}`}
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0a1c10]/82 via-[#0a1c10]/55 to-[#0a1c10]/10" />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#f6f5f0] to-transparent dark:from-[#101913]" />

          <motion.div
            className="relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col justify-center px-5 sm:px-9 lg:px-12 xl:px-16"
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <p className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8e5d9] backdrop-blur-sm sm:text-xs">Receiver Workspace</p>
            <h1 id="provider-directory-title" className="mt-4 font-archivo text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-[3.5rem]">
              Provider <span className="text-[#6ee584]">Directory</span>
            </h1>

            <dl className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
              {([
                { kind: "providers", value: providers.length.toLocaleString("en-IN"), label: "Active providers" },
                { kind: "records", value: listings.length.toLocaleString("en-IN"), label: "Material records" },
                { kind: "tonnes", value: `${Math.round(totalAvailableT).toLocaleString("en-IN")} t`, label: "Total available" },
              ] as const).map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#b9d8bf]">
                    <StatIcon kind={stat.kind} />
                  </span>
                  <div>
                    <dd className="ledger-numeral font-archivo text-lg font-bold leading-5 text-white">{stat.value}</dd>
                    <dt className="text-xs leading-4 text-white/70">{stat.label}</dt>
                  </div>
                </div>
              ))}
            </dl>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Search, filters, sort, view toggle                          */}
      {/* ---------------------------------------------------------- */}
      <div className={`mx-auto max-w-app px-4 pt-6 sm:px-card xl:px-section transition-all duration-300 ${activePassportListing ? "lg:pe-[520px] xl:pe-[540px]" : ""}`}>

        {activeTab === "providers" && (
          <SearchFilterBar
            searchValue={materialSearch}
            onSearchChange={handleMaterialSearchChange}
            searchPlaceholder={t("providerDirectory.searchPlaceholder")}
            searchLabel={t("providerDirectory.searchLabel")}
            activeFilterCount={activeFilterCount}
            onClearFilters={() => {
              setType("");
              setMaterialSearch("");
              setLocation("");
              setMinimumQuantity("");
              setMaximumQuantity("");
              setMinimumPrice("");
              setMaximumPrice("");
              setAvailableBy("");
              setCondition("");
              setVerificationFilter("");
            }}
            resultLabel={t("providerDirectory.resultCount", { shown: filteredListings.length, total: listings.length })}
            filters={
              <>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.location")}
                  <input type="search" value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("providerDirectory.locationPlaceholder")} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.minAvailableQuantity")}
                  <input type="number" min="0" step="any" value={minimumQuantity} onChange={(event) => setMinimumQuantity(event.target.value)} aria-invalid={invalidQuantityValue || invalidQuantityRange} aria-describedby={invalidQuantityValue || invalidQuantityRange ? "quantity-range-error" : undefined} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.maxAvailableQuantity")}
                  <input type="number" min="0" step="any" value={maximumQuantity} onChange={(event) => setMaximumQuantity(event.target.value)} aria-invalid={invalidQuantityValue || invalidQuantityRange} aria-describedby={invalidQuantityValue || invalidQuantityRange ? "quantity-range-error" : undefined} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.minPrice")}
                  <input type="number" min="0" step="any" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} aria-invalid={invalidPriceValue || invalidPriceRange} aria-describedby={invalidPriceValue || invalidPriceRange ? "price-range-error" : undefined} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.maxPrice")}
                  <input type="number" min="0" step="any" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} aria-invalid={invalidPriceValue || invalidPriceRange} aria-describedby={invalidPriceValue || invalidPriceRange ? "price-range-error" : undefined} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.availableBy")}
                  <input type="date" value={availableBy} onChange={(event) => setAvailableBy(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  {t("providerDirectory.condition")}
                  <select value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white">
                    <option value="">{t("providerDirectory.anyCondition")}</option>
                    {conditions.map((item) => <option key={item} value={item}>{t(`recordCrud.${item}`)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                  Verification &amp; Trust
                  <select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white">
                    <option value="">All Verification States</option>
                    <option value="verified">Certified Verified Only</option>
                    <option value="evidence">Evidence Attached on File</option>
                  </select>
                </label>
                {(invalidQuantityValue || invalidQuantityRange) && <p id="quantity-range-error" role="alert" className="text-xs text-error-500 sm:col-span-2">{t(invalidQuantityValue ? "providerDirectory.negativeQuantity" : "providerDirectory.invalidQuantityRange")}</p>}
                {(invalidPriceValue || invalidPriceRange) && <p id="price-range-error" role="alert" className="text-xs text-error-500 sm:col-span-2">{t(invalidPriceValue ? "providerDirectory.negativePrice" : "providerDirectory.invalidPriceRange")}</p>}
              </>
            }
            actions={
              <>
              <label className="relative hidden items-center md:flex">
                <span className="sr-only">Sort listings</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="pointer-events-none absolute start-3 size-4 text-steel-400"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" /></svg>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortKey)}
                  className="h-11 appearance-none rounded-control border border-steel-300 bg-white ps-9 pe-8 text-sm font-semibold text-ink-900 outline-none transition focus:border-loop-500 focus:ring-2 focus:ring-loop-500/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
                >
                  {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>Sort by {option.label}</option>)}
                </select>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute end-2.5 size-4 text-steel-400"><path d="m6 9 6 6 6-6" /></svg>
              </label>
              <div role="group" aria-label="View mode" className="flex h-11 items-center rounded-control border border-steel-300 bg-white p-1 dark:border-steel-700 dark:bg-[#17251d]">
                {([
                  { id: "grid" as ViewMode, label: "Grid view", icon: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></> },
                  { id: "list" as ViewMode, label: "List view", icon: <><path d="M4 6h16M4 12h16M4 18h16" /></> },
                ]).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={view === mode.id}
                    aria-label={mode.label}
                    onClick={() => setView(mode.id)}
                    className={`flex size-8 items-center justify-center rounded-[7px] transition-colors ${view === mode.id ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-steel-500 hover:text-ink-900 dark:text-gray-400 dark:hover:text-white"}`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">{mode.icon}</svg>
                  </button>
                ))}
              </div>
              </>
            }
          />
        )}

        {/* ------------------------------------------------------ */}
        {/* Tabs — All Providers / Requests Sent / Offers Received  */}
        {/* ------------------------------------------------------ */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-[#e5e2da] bg-[#f7f6f0] p-1 shadow-sm dark:border-steel-800 dark:bg-[#1a2b21] sm:w-max">
          <button type="button" onClick={() => setActiveTab("providers")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "providers" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c]" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>All Providers</button>
          <button type="button" onClick={() => setActiveTab("sent")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "sent" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c]" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>Requests Sent</button>
          <button type="button" onClick={() => setActiveTab("received")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "received" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c] dark:text-white" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>Offers Received</button>
          <button type="button" onClick={() => setActiveTab("auctions")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "auctions" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c] dark:text-white" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>{t("auctions.tab")}</button>
        </div>


        {/* ------------------------------------------------------ */}
        {/* Haulage Distance Filter Strip (All Providers tab)      */}
        {/* ------------------------------------------------------ */}
        {activeTab === "providers" && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-steel-500 dark:text-gray-400">Haulage Radius:</span>
            {[
              { id: "", label: "All Corridors" },
              { id: "25", label: "< 25 km (Local Yard)" },
              { id: "50", label: "< 50 km (Metro Tier)" },
              { id: "100", label: "< 100 km (Regional Tier)" },
            ].map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setDistanceTier(tier.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  distanceTier === tier.id
                    ? "bg-[#16733d] text-white shadow-xs dark:bg-[#00e599] dark:text-[#0c1811]"
                    : "border border-steel-200 bg-white text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-300"
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* All Providers — grid / list                             */}
        {/* ------------------------------------------------------ */}
        {activeTab === "providers" && (
          sortedListings.length ? (
            <motion.section
              aria-label="Available provider materials"
              className={
                view === "grid"
                  ? `grid gap-4 sm:gap-5 ${
                      activePassportListing
                        ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
                    }`
                  : "flex flex-col gap-4"
              }
              initial={reduceMotion ? false : "hidden"}
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
              {sortedListings.map((listing) => {
                const media = materialMediaFor(listing.materialType);
                const stock = stockStatus(listing);
                const isSelected = activePassportListing?.materialId === listing.materialId;
                const isVerified = listing.verificationStatus === "verified";
                const isRejected = listing.verificationStatus === "rejected";
                const matchCandidate = receiverContextMatches.get(listing.materialId);
                const isEligible = matchCandidate ? matchCandidate.isEligible : (listing.availableT > 0 && listing.listingStatus !== "paused" && listing.listingStatus !== "archived");
                const isBestMatch = sortBy === "best-match" && isEligible && (
                  (matchCandidate && matchCandidate.score >= 0.70) ||
                  (sortedListings[0]?.materialId === listing.materialId)
                );

                return (
                  <motion.article
                    key={listing.materialId}
                    variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.35, ease: EASE }}
                    whileHover={reduceMotion ? undefined : { y: -3 }}
                    onClick={() => setActivePassportListing(listing)}
                    className={`group flex flex-col justify-between rounded-2xl border bg-white p-3 shadow-2xs transition-all hover:border-[#9ec1a5] hover:shadow-xs dark:bg-[#17251d] cursor-pointer ${
                      isSelected
                        ? "border-[#164b2d] ring-2 ring-[#164b2d]/20 dark:border-[#00e599] dark:ring-[#00e599]/20"
                        : "border-steel-200/90 dark:border-steel-800"
                    }`}
                  >
                    <div>
                      {/* Material Image */}
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-steel-100 dark:bg-steel-800">
                        <img
                          src={media.src}
                          alt={listing.name || materialTypeLabel(listing.materialType)}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute start-2.5 top-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#22301f] shadow-sm backdrop-blur-sm dark:bg-[#1b2b22]/95 dark:text-white">
                            <span
                              aria-hidden="true"
                              className={`size-2 rounded-full ${stock.tone === "green" ? "bg-[#2fae5e]" : "bg-[#e0a83c]"}`}
                            />
                            {stock.label}
                          </span>
                        </div>
                      </div>

                      {/* Title & Available Quantity Row */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <h2 className="font-archivo text-base font-bold text-ink-900 dark:text-white truncate" title={listing.name || materialTypeLabel(listing.materialType)}>
                          {listing.name || materialTypeLabel(listing.materialType)}
                        </h2>
                        <span className="font-archivo text-base font-bold text-ink-900 dark:text-white shrink-0">
                          {listing.availableT.toLocaleString("en-IN")} t
                        </span>
                      </div>

                      {/* Project Origin & Location */}
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-steel-500 dark:text-steel-400 font-medium truncate">
                        <svg className="size-3.5 shrink-0 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="truncate">{listing.projectName || "Project 1"} · {listing.location || listing.projectLocation || "Delhi"}</span>
                      </p>

                      {/* Verification Status & Quality Grade Badges */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {isBestMatch && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#eaf4ec] px-2 py-0.5 text-[11px] font-semibold text-[#164b2d] dark:bg-[#164b2d]/50 dark:text-[#6ee584]">
                            ★ Best match
                          </span>
                        )}
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ed] px-2.5 py-0.5 text-[11px] font-semibold text-[#164b2d] dark:bg-[#164b2d]/40 dark:text-[#6ee584]">
                            <span className="size-1.5 rounded-full bg-[#164b2d] dark:bg-[#6ee584]" />
                            Verified
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            <span className="size-1.5 rounded-full bg-red-600" />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <span className="size-1.5 rounded-full bg-amber-600" />
                            Unverified
                          </span>
                        )}

                        <span className="inline-flex items-center rounded-md bg-[#f2f1ec] px-2 py-0.5 text-[11px] font-medium text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                          Grade {listing.grade || "A"}
                        </span>
                      </div>
                    </div>

                    {/* State-based Action Button: View Order / Continue Negotiation / View Request / Request Material */}
                    {(() => {
                      const existingBooking = dataset.bookings?.find(
                        (b) => b.materialId === listing.materialId && b.receiverId === user?.receiverId && b.status !== "cancelled"
                      );
                      const existingOffer = (dataset.offers ?? []).find(
                        (o) => o.passportId === listing.materialId && o.status !== "declined"
                      );
                      const existingDemand = (dataset.demands ?? []).find(
                        (d) => d.targetMaterialId === listing.materialId && d.receiverId === user?.receiverId && d.status !== "CANCELLED"
                      );

                      if (existingBooking) {
                        return (
                          <Link
                            to={`/app/orders/${existingBooking.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                          >
                            <span>View Order #{existingBooking.id.slice(0, 6)}</span>
                            <span>→</span>
                          </Link>
                        );
                      }

                      if (existingOffer) {
                        return (
                          <Link
                            to={`/app/negotiations/${existingOffer.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          >
                            <span>Continue Negotiation</span>
                            <span>→</span>
                          </Link>
                        );
                      }

                      if (existingDemand) {
                        return (
                          <Link
                            to={`/app/receiver/demand?demand=${encodeURIComponent(existingDemand.id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-steel-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-steel-800 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-200"
                          >
                            <span>View Request</span>
                            <span>→</span>
                          </Link>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activePassportListing?.materialId === listing.materialId) {
                              setSelectedListingForOrder(listing);
                            } else {
                              setActivePassportListing(listing);
                            }
                          }}
                          className="mt-3.5 flex w-full items-center justify-center rounded-xl bg-[#164b2d] px-3.5 py-2.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#22633e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164b2d] dark:bg-[#1c5434] dark:hover:bg-[#287247]"
                        >
                          Request Material
                        </button>
                      );
                    })()}
                  </motion.article>
                );
              })}
            </motion.section>
          ) : (
            <div className="rounded-2xl border border-dashed border-steel-300 bg-white/60 px-6 py-12 text-center dark:border-steel-700 dark:bg-white/[0.02]">
              <h2 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{listings.length ? "No listings match these filters" : "No available provider listings yet"}</h2>
              <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">{listings.length ? "Adjust your material, location, quantity, price, date, or condition filters." : "Available material records from providers will appear here."}</p>
            </div>
          )
        )}


        {/* ------------------------------------------------------ */}
        {/* Requests Sent                                           */}
        {/* ------------------------------------------------------ */}
        {activeTab === "sent" && (
          <section className="overflow-hidden rounded-2xl border border-[#e5e2da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.05)] dark:border-steel-800 dark:bg-[#17251d]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eeeae2] px-4 py-4 dark:border-steel-800 sm:px-5">
              <div>
                <h2 className="font-archivo text-xl font-bold text-[#26362c] dark:text-white">Requests you have sent to providers</h2>
                <p className="mt-0.5 text-xs text-[#7c857d] dark:text-gray-400">{filteredMyRequests.length ? `${filteredMyRequests.length} requests sent` : "Your direct requests to providers will appear here."}</p>
              </div>
            </div>
            {filteredMyRequests.length === 0 ? (
              <p className="px-5 py-5 text-sm text-[#778078] dark:text-gray-400">No requests sent matching these filters.</p>
            ) : (
              <ul className="divide-y divide-[#eeeae2] dark:divide-steel-800">
                {sortedMyRequests.map((demand) => {
                  const targetProvider = dataset.providerListings?.find(l => l.materialId === demand.targetMaterialId);
                  return (
                    <li key={demand.id} className="grid gap-card hover:bg-[#fcfbf9] dark:hover:bg-white/[0.02] gl-card-pad sm:grid-cols-[2fr_1fr_1fr]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-900 dark:text-white">{materialTypeLabel(demand.materialType)}</span>
                          <StatusBadge status={demand.status} />
                        </div>
                        <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">{demand.requiredT.toFixed(1)} t · Needed by {demand.period}</p>
                        <p className="mt-1 truncate text-xs text-steel-500">To: {demand.targetProviderName ?? targetProvider?.organization ?? "Provider"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-steel-500">Status</p>
                        <p className="mt-1 text-sm text-ink-900 dark:text-white">{demand.status === "OPEN" ? "Waiting for provider" : demand.status}</p>
                      </div>
                      <div className="flex items-center justify-end">
                        <Link to={`/app/receiver/demand?demand=${encodeURIComponent(demand.id)}`} className="text-sm font-semibold text-[#416d4b] hover:underline dark:text-[#b8d0bd]">View request</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ------------------------------------------------------ */}
        {/* Offers Received                                         */}
        {/* ------------------------------------------------------ */}
        {activeTab === "received" && (
          <section className="overflow-hidden rounded-2xl border border-[#e5e2da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.05)] dark:border-steel-800 dark:bg-[#17251d]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eeeae2] px-4 py-4 dark:border-steel-800 sm:px-5">
              <div>
                <h2 className="font-archivo text-xl font-bold text-[#26362c] dark:text-white">Offers received from providers</h2>
                <p className="mt-0.5 text-xs text-[#7c857d] dark:text-gray-400">{filteredMyOffers.length ? `${filteredMyOffers.length} offers received` : "When providers offer material for your requests, they will appear here."}</p>
              </div>
            </div>
            {filteredMyOffers.length === 0 ? (
              <p className="px-5 py-5 text-sm text-[#778078] dark:text-gray-400">No offers received matching these filters.</p>
            ) : (
              <ul className="divide-y divide-[#eeeae2] dark:divide-steel-800">
                {sortedMyOffers.map((offer) => {
                  const demand = dataset.demands?.find((d) => d.id === offer.demandId);
                  const passport = dataset.materials?.find(m => m.id === offer.passportId);
                  const provider = dataset.providerListings?.find(l => l.providerId === offer.providerId);

                  const filters = {
                    minimumQuantityT: minimumQuantity ? Number(minimumQuantity) : undefined,
                    maximumBudget: maximumPrice ? Number(maximumPrice) : undefined,
                    neededBy: availableBy || undefined,
                  };

                  const matchCandidates = demand ? contextualMatch(dataset, { demandId: demand.id, offerId: offer.id }, filters) : [];
                  const matchCandidate = matchCandidates[0];

                  return (
                    <li key={offer.id} className="grid gap-card hover:bg-[#fcfbf9] dark:hover:bg-white/[0.02] gl-card-pad">
                      <div className="grid gap-card sm:grid-cols-[2fr_1fr_1fr]">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900 dark:text-white">{passport ? materialTypeLabel(passport.type) : "Material"}</span>
                            <StatusBadge status={offer.status} />
                            {matchCandidate && matchCandidate.isEligible && matchCandidate.score >= 0.82 && (
                              <span className="rounded bg-[#eaf4ec] px-2 py-0.5 text-xs font-semibold text-[#164b2d] dark:bg-[#164b2d]/50 dark:text-[#6ee584]">★ Best match</span>
                            )}
                            {matchCandidate && matchCandidate.isFullMatch && <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Full Match</span>}
                            {matchCandidate && matchCandidate.isPartialMatch && <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-800">Partial Match</span>}
                          </div>
                          <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">{offer.offeredQuantityT.toFixed(1)} t offered @ {offer.pricePerT !== undefined ? formatINRPerT(offer.pricePerT) : "Negotiable"}</p>
                          <p className="mt-1 truncate text-xs text-steel-500">From: {provider?.organization ?? offer.providerId}</p>
                          <p className="mt-0.5 truncate text-xs text-steel-500">For your request: {demand?.requiredT.toFixed(1)} t {demand ? materialTypeLabel(demand.materialType) : ""}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-steel-500">Match Score</p>
                          <p className="mt-1 text-sm font-bold text-[#4b7956] dark:text-[#a9c7b0]">
                            {matchCandidate ? `${Math.round(matchCandidate.score * 100)}% Match` : "N/A"}
                          </p>
                        </div>
                        <div className="flex items-center justify-end">
                          {demand && <Link to={`/app/receiver/demand?demand=${encodeURIComponent(demand.id)}${offer.status === "pending" ? `&offer=${encodeURIComponent(offer.id)}` : ""}`} className="text-sm font-semibold text-[#416d4b] hover:underline dark:text-[#b8d0bd]">{offer.status === "pending" ? "Respond" : "View request"}</Link>}
                        </div>
                      </div>
                      {matchCandidate && (
                        <details className="mt-2 text-xs text-[#526b58] dark:text-[#b6cfbd]">
                          <summary className="w-fit cursor-pointer font-semibold">View Match Details <span aria-hidden="true">→</span></summary>
                          <div className="mt-3 text-left">
                            <MatchDetailsPanel match={matchCandidate} />
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {activeTab === "auctions" && <AuctionsBoard />}

        {selectedListingForOrder && (
          <ReceiverCheckoutModal
            isOpen={Boolean(selectedListingForOrder)}
            onClose={() => setSelectedListingForOrder(null)}
            listing={selectedListingForOrder}
            defaultQuantityT={Math.min(selectedListingForOrder.availableT, 10)}
          />
        )}

        <MaterialPassportDrawer
          material={activePassportMaterial}
          project={activePassportProject}
          isOpen={Boolean(activePassportListing)}
          onClose={() => setActivePassportListing(null)}
          mode="receiver"
          onRequestMaterial={() => {
            if (activePassportListing) {
              setSelectedListingForOrder(activePassportListing);
            }
          }}
        />
      </div>
    </div>
  );
}
