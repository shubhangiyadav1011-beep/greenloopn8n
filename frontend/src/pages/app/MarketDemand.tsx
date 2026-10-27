import PageMeta from "@/components/common/PageMeta";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import MatchDetailsPanel from "@/components/greenloop/MatchDetailsPanel";
import ReceiverDiscovery from "@/components/greenloop/ReceiverDiscovery";
import SearchFilterBar from "@/components/greenloop/SearchFilterBar";
import StatusBadge from "@/components/greenloop/StatusBadge";
import Button from "@/components/ui/button/Button";
import { materialMediaFor, ambientVideo } from "@/config/appMedia";
import { VideoPanel } from "@/components/greenloop/kit";
import { useAuth } from "@/context/AuthContext.helpers";
import { contextualMatch } from "@shared/domain/capacity";
import type { MaterialTypeKey } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate, formatINR, formatINRPerT, materialTypeLabel } from "@/utils";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

type DemandCategory = "all" | MaterialTypeKey | "other";

const commonMaterialTypes = new Set<string>(["concrete", "brick", "steel", "timber"]);

function DemandMetricIcon({ kind }: { kind: "requests" | "volume" | "receivers" | "matched" }) {
  const paths = {
    requests: <><path d="M5 4h14v16H5z" /><path d="M8 8h8m-8 4h8m-8 4h5" /></>,
    volume: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7m-8 4v10" /></>,
    receivers: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8m-8 4h5" /><circle cx="17" cy="16" r="1" /></>,
    matched: <><path d="M4 19V9l8-5 8 5v10" /><path d="M9 19v-6h6v6m-7-5 2 2 4-4" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">{paths[kind]}</svg>;
}

export default function MarketDemand() {
  const { t } = useTranslation();
  const { dataset, addOfferAction, saveOfferDraftAction, deleteOfferDraftAction, withdrawOfferAction } = useGreenLoopStore();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const providerId = user?.email ?? "P-001";
  const openDemands = useMemo(() => dataset.demands.filter((demand) => demand.status === "OPEN" || demand.status === "PARTIALLY_COVERED"), [dataset.demands]);

  const navigationKey = searchParams.toString();
  const [selectedDemandOverride, setSelectedDemandOverride] = useState<{ query: string; id: string | null } | null>(null);
  const selectedDemandId = selectedDemandOverride?.query === navigationKey ? selectedDemandOverride.id : searchParams.get("demand");
  const setSelectedDemandId = (id: string | null) => setSelectedDemandOverride({ query: navigationKey, id });
  const paramCategory = (searchParams.get("type") || searchParams.get("category")) as DemandCategory | null;
  const initialCategory: DemandCategory = paramCategory && ["concrete", "brick", "steel", "timber", "plasterboard", "glass", "other"].includes(paramCategory) ? paramCategory : "all";
  const initialPassport = searchParams.get("materialId") || searchParams.get("passport") || "";

  const [selectedPassportId, setSelectedPassportId] = useState(initialPassport);
  const [offerQuantity, setOfferQuantity] = useState("");
  const [offerPricePerT, setOfferPricePerT] = useState("");
  const [offerError, setOfferError] = useState("");
  const [category, setCategory] = useState<DemandCategory>(initialCategory);
  const [query, setQuery] = useState("");
  const [minimumT, setMinimumT] = useState("");
  const [maximumBudget, setMaximumBudget] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const myOffers = dataset.offers?.filter((offer) => offer.providerId === providerId && !offer.auctionId) ?? [];

  type TabKey = "received" | "sent" | "receivers";
  const [tabOverride, setTabOverride] = useState<{ query: string; tab: TabKey } | null>(null);
  const activeTab: TabKey = tabOverride?.query === navigationKey ? tabOverride.tab : searchParams.get("demand") ? "received" : searchParams.get("view") === "receivers" ? "receivers" : "received";
  const setActiveTab = (tab: TabKey) => setTabOverride({ query: navigationKey, tab });

  useEffect(() => {
    const demandId = searchParams.get("demand");
    if (demandId) {
      const timer = window.setTimeout(() => {
        const sendBtn = document.getElementById("send-offer-btn");
        if (sendBtn) {
          sendBtn.scrollIntoView({ block: "center", behavior: "smooth" });
        } else {
          document.getElementById(`demand-${demandId}`)?.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams, selectedDemandId, openDemands.length]);

  useEffect(() => {
    const paramCat = (searchParams.get("type") || searchParams.get("category")) as DemandCategory | null;
    if (paramCat && ["concrete", "brick", "steel", "timber", "plasterboard", "glass", "other"].includes(paramCat)) {
      setCategory(paramCat);
    }
    const matId = searchParams.get("materialId") || searchParams.get("passport");
    if (matId) {
      setSelectedPassportId(matId);
      const passport = dataset.materials.find((m) => m.id === matId);
      if (passport) {
        setOfferPricePerT(passport.pricePerT !== undefined && passport.pricePerT !== null ? String(passport.pricePerT) : "");
        setOfferQuantity(String(passport.quantityT));
      }
    }
  }, [searchParams, dataset.materials]);

  const filteredDemands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return openDemands.filter((demand) => {
      const isOther = !commonMaterialTypes.has(demand.materialType);
      const matchesCategory = category === "all"
        || (category === "other" ? isOther : demand.materialType === category);
      const receiver = dataset.receivers.find((item) => item.id === demand.receiverId);
      const searchableValues = [
        materialTypeLabel(demand.materialType),
        demand.location,
        demand.period,
        demand.id,
        receiver?.name ?? "",
        receiver?.location ?? "",
        demand.notes ?? "",
      ];
      const matchesQuery = !normalizedQuery || searchableValues.some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesQuantity = !minimumT || demand.requiredT >= Number(minimumT);
      const matchesBudget = !maximumBudget || (demand.budgetPerT !== undefined && demand.budgetPerT <= Number(maximumBudget));
      const matchesNeededBy = !neededBy || demand.period <= neededBy;
      return matchesCategory && matchesQuery && matchesQuantity && matchesBudget && matchesNeededBy;
    });
  }, [category, dataset.receivers, openDemands, query, minimumT, maximumBudget, neededBy]);

  const sortedDemands = useMemo(() => {
    return [...filteredDemands].sort((a, b) => {
      const isDirectA = a.targetProviderId === providerId;
      const isDirectB = b.targetProviderId === providerId;
      if (isDirectA !== isDirectB) return isDirectA ? -1 : 1;

      const candA = contextualMatch(dataset, { demandId: a.id }).filter((c) => c.providerId === providerId)[0];
      const candB = contextualMatch(dataset, { demandId: b.id }).filter((c) => c.providerId === providerId)[0];

      const eligA = candA?.isEligible ?? false;
      const eligB = candB?.isEligible ?? false;
      if (eligA !== eligB) return eligA ? -1 : 1;

      const scoreA = candA?.score ?? 0;
      const scoreB = candB?.score ?? 0;
      if (Math.abs(scoreB - scoreA) > 0.01) return scoreB - scoreA;

      return b.requiredT - a.requiredT;
    });
  }, [filteredDemands, dataset, providerId]);



  const neededT = openDemands.reduce((total, demand) => total + demand.requiredT, 0);
  const receivingProjects = new Set(openDemands.map((demand) => demand.receiverId)).size;
  const matchedPassports = new Set(myOffers.filter((offer) => offer.status === "accepted").map((offer) => offer.passportId)).size;
  const metrics = [
    { label: "Open Requests", value: openDemands.length.toLocaleString(), note: "Open and partially covered", kind: "requests" as const },
    { label: "Total Material Needed", value: `${neededT.toFixed(1)} t`, note: "Across open requests", kind: "volume" as const },
    { label: "Receiving Projects", value: receivingProjects.toLocaleString(), note: "Requesting facilities", kind: "receivers" as const },
    { label: "Materials Matched", value: matchedPassports.toLocaleString(), note: "Accepted provider offers", kind: "matched" as const },
  ];

  const handleOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmittingOffer) return;
    const quantity = Number(offerQuantity);
    const passport = dataset.materials.find((item) => item.id === selectedPassportId);
    const demand = dataset.demands.find((item) => item.id === selectedDemandId);
    const committedT = dataset.bookings.filter((booking) => booking.materialId === selectedPassportId && booking.status !== "cancelled")
      .reduce((total, booking) => total + booking.tonnesT, 0);
    const availableT = Math.max(0, (passport?.quantityT ?? 0) - committedT);
    if (!passport || !demand || !Number.isFinite(quantity) || quantity <= 0 || quantity > availableT) {
      setOfferError("Choose a passport and offer a positive quantity within its available amount.");
      return;
    }
    setOfferError("");
    setIsSubmittingOffer(true);
    try {
      const saved = await addOfferAction({
        demandId: demand.id,
        providerId,
        passportId: selectedPassportId,
        offeredQuantityT: quantity,
        ...(offerPricePerT !== "" ? { pricePerT: Number(offerPricePerT) } : {}),
      });
      
      if (!saved) return;
      setSelectedDemandId(null);
      setSelectedPassportId("");
      setOfferQuantity("");
      setOfferPricePerT("");
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "Failed to submit offer.");
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const handleSaveOfferDraft = async () => {
    if (isSubmittingOffer) return;
    const quantity = Number(offerQuantity);
    const passport = dataset.materials.find((item) => item.id === selectedPassportId);
    const demand = dataset.demands.find((item) => item.id === selectedDemandId);
    const committedT = dataset.bookings.filter((booking) => booking.materialId === selectedPassportId && booking.status !== "cancelled")
      .reduce((total, booking) => total + booking.tonnesT, 0);
    const availableT = Math.max(0, (passport?.quantityT ?? 0) - committedT);
    if (!passport || !demand || !Number.isFinite(quantity) || quantity <= 0 || quantity > availableT) {
      setOfferError("Choose a passport and offer a positive quantity within its available amount to save this draft.");
      return;
    }
    setOfferError("");
    setIsSubmittingOffer(true);
    try {
      if (!await saveOfferDraftAction({ demandId: demand.id, providerId, passportId: passport.id, offeredQuantityT: quantity, ...(offerPricePerT !== "" ? { pricePerT: Number(offerPricePerT) } : {}) })) return;
      setSelectedDemandId(null); setSelectedPassportId(""); setOfferQuantity(""); setOfferPricePerT("");
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "Failed to save draft offer.");
    } finally {
      setIsSubmittingOffer(false);
    }
  };


  return (
    <div className="pb-16">
      <PageMeta title="Active Demand | GreenLoop" description="See material requests from receivers and offer your material." />

      <section className="relative">
        <VideoPanel
          video={ambientVideo.activeDemand}
          aspect="min-h-[340px] sm:min-h-[365px] lg:min-h-[385px]"
          className="rounded-none border-0 shadow-none"
          scrim="bg-gradient-to-r from-[#14271b]/95 via-[#14271b]/75 to-[#14271b]/20"
        >
          <div className="relative z-10 flex h-full flex-col justify-center px-5 pt-24 pb-10 sm:px-9 sm:pt-24 lg:px-12 xl:px-16">
            <p className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8e5d9] backdrop-blur-sm sm:text-xs">GreenLoop Operations</p>
            <h1 className="mt-4 font-archivo text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-[3.5rem]">Active <span className="text-[#6ee584]">Demand</span></h1>
          </div>
        </VideoPanel>

      <section aria-label="Demand summary" className="relative z-10 mx-3 mt-4 grid grid-cols-2 gap-2 sm:mx-6 xl:mx-10 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <motion.div key={metric.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: index * 0.07 }} className="flex min-h-[64px] items-center gap-2.5 rounded-[15px] border border-[#e8e5dc] bg-[#fffefa]/95 px-3 py-2 shadow-[0_6px_18px_rgba(26,42,31,0.09)] backdrop-blur-md dark:border-steel-700 dark:bg-[#17251d]/95 sm:px-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eaf2ea] text-[#487454] dark:bg-[#284233] dark:text-[#b6d1bd]"><DemandMetricIcon kind={metric.kind} /></span>
            <div className="min-w-0">
              <p className="font-archivo text-base font-bold leading-4 text-[#1d2c23] dark:text-white">{metric.value}</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-3 text-[#38483e] dark:text-gray-200 sm:text-[11px]">{metric.label}</p>
              <p className="mt-0.5 hidden truncate text-[9px] leading-3 text-[#828b83] dark:text-gray-400 sm:block">{metric.note}</p>
            </div>
          </motion.div>
        ))}
      </section>
      </section>

      <div className="mx-auto max-w-app px-4 sm:px-card xl:px-section">
      <div className="mt-4 mb-6 flex flex-wrap gap-1.5 rounded-full border border-[#e5e2da] bg-[#f7f6f0] p-1.5 shadow-sm dark:border-steel-800 dark:bg-[#1a2b21] sm:w-max">
        <button type="button" onClick={() => setActiveTab("receivers")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "receivers" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c]" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>All Receivers</button>
        <button type="button" onClick={() => setActiveTab("sent")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "sent" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c]" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>Requests Sent</button>
        <button type="button" onClick={() => setActiveTab("received")} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px sm:flex-none ${activeTab === "received" ? "bg-[#315b3c] text-white shadow-[0_4px_12px_rgba(49,91,60,0.2)] dark:bg-[#527e5c]" : "text-[#7c857d] hover:bg-white/70 hover:text-[#26362c] dark:text-gray-400 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"}`}>Requests Received</button>
      </div>

      {activeTab === "received" && (
        <section id="active-demand-list" aria-label="Active material requests" className="relative isolate">
        <div className="relative z-10">
        <div className="relative isolate mb-4 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <img src="/images/site/inventory-nature-concrete.png" alt="" className="absolute -top-10 right-0 h-[190px] w-[68%] object-contain object-right sm:-top-12 sm:h-[210px] sm:w-[62%] xl:w-[54%]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f6f5f0_0%,rgba(246,245,240,0.3)_22%,rgba(246,245,240,0.08)_42%,transparent_68%)] dark:bg-[linear-gradient(to_right,#101913_0%,rgba(16,25,19,0.3)_22%,rgba(16,25,19,0.08)_42%,transparent_68%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#f6f5f0_0%,rgba(246,245,240,0.1)_12%,transparent_30%)] dark:bg-[linear-gradient(to_bottom,#101913_0%,rgba(16,25,19,0.1)_12%,transparent_30%)]" />
        </div>
        <div className="relative z-10">
        <SearchFilterBar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search material, location, receiver…"
          searchLabel="Search active demand"
          activeFilterCount={[category !== "all" ? category : "", minimumT, maximumBudget, neededBy].filter(Boolean).length}
          onClearFilters={() => { setCategory("all"); setMinimumT(""); setMaximumBudget(""); setNeededBy(""); }}
          resultLabel={<span className="rounded-full border border-[#e3e3d9]/80 bg-[#f6f5f0]/90 px-2.5 py-1 text-[#55645a] shadow-sm backdrop-blur-sm dark:border-steel-700 dark:bg-[#17251d]/90 dark:text-gray-300">{`Showing ${filteredDemands.length} of ${openDemands.length} requests`}</span>}
          filters={
            <>
              <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
                Material type
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as DemandCategory)}
                  className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
                >
                  <option value="all">All Material Types</option>
                  <option value="concrete">Concrete</option>
                  <option value="brick">Brick</option>
                  <option value="steel">Steel</option>
                  <option value="timber">Timber / Wood</option>
                  <option value="plasterboard">Plasterboard</option>
                  <option value="glass">Glass</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs font-medium text-steel-600 dark:text-gray-300">Minimum required tonnes<input type="number" min="0" value={minimumT} onChange={(event) => setMinimumT(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" /></label>
              <label className="text-xs font-medium text-steel-600 dark:text-gray-300">Maximum budget / tonne (₹)<input type="number" min="0" value={maximumBudget} onChange={(event) => setMaximumBudget(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" /></label>
              <label className="text-xs font-medium text-steel-600 dark:text-gray-300">Needed by<input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white" /></label>
            </>
          }
        />
        </div>
        </div>

        {filteredDemands.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ccd6ce] bg-gradient-to-b from-[#fbfbfa] to-[#f5f4ef] px-6 py-12 text-center shadow-xs dark:border-[#1f3727] dark:from-[#0e1913]/90 dark:to-[#08100c]/90">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-[#1e4631] shadow-xs dark:border-emerald-500/25 dark:bg-emerald-950/50 dark:text-[#00e599]">
              <DemandMetricIcon kind="requests" />
            </span>
            <h2 className="mt-4 font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">
              {openDemands.length ? "No matching material requests" : "No open material requests"}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-steel-600 dark:text-steel-400">
              {openDemands.length
                ? "Try searching for a different material type, adjusting tonnage, or clearing filters."
                : "Active requests from facilities needing material will appear here as soon as they are published."}
            </p>
            {openDemands.length > 0 && (
              <button
                type="button"
                onClick={() => { setQuery(""); setCategory("all"); setMinimumT(""); setMaximumBudget(""); setNeededBy(""); }}
                className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1c3c2b] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#254f38] dark:bg-[#224833] dark:hover:bg-[#2b5a40]"
              >
                Clear search and filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-detail">
            {sortedDemands.map((demand, index) => {
              const receiver = dataset.receivers.find((item) => item.id === demand.receiverId);
              const isOffering = selectedDemandId === demand.id;
              const availablePassports = dataset.materials.filter((item) => item.type === demand.materialType && (!demand.targetMaterialId || item.id === demand.targetMaterialId) && item.status !== "cancelled" && item.listingStatus !== "draft" && item.listingStatus !== "paused" && item.listingStatus !== "archived" && item.quantityT > dataset.bookings.filter((booking) => booking.materialId === item.id && booking.status !== "cancelled").reduce((sum, booking) => sum + booking.tonnesT, 0));
              const existingOffer = myOffers.find((offer) => offer.demandId === demand.id);
              const hasActiveOffer = Boolean(existingOffer && existingOffer.status !== "draft" && existingOffer.status !== "declined" && existingOffer.status !== "withdrawn");
              const image = materialMediaFor(demand.materialType);
              const myCandidate = contextualMatch(dataset, { demandId: demand.id }).filter((c) => c.providerId === providerId)[0];
              const isBestMatch = myCandidate?.isEligible && myCandidate.score >= 0.82;
              return (
                <motion.article id={`demand-${demand.id}`} key={demand.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3, transition: { duration: 0.18 } }} transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.35 }} className="group overflow-hidden border border-[#e5e2da] bg-white shadow-[0_5px_18px_rgba(26,42,31,0.055)] transition-[border-color,box-shadow] hover:border-[#bfccbf] hover:shadow-[0_14px_32px_rgba(26,42,31,0.11)] dark:border-steel-800 dark:bg-[#17251d] dark:hover:border-[#506957] rounded-[17px]">
                  <div className="grid lg:grid-cols-[112px_minmax(0,1fr)_220px]">
                    <div className="relative min-h-28 overflow-hidden lg:min-h-[118px]">
                      <img src={image.src} alt={image.alt} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#142319]/50 via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-3 border border-white/30 bg-[#17281e]/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm rounded-full">{materialTypeLabel(demand.materialType)}</span>
                    </div>

                    <div className="min-w-0 p-3 sm:p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a938b]">Receiver Request</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h2 className="font-archivo text-lg font-bold tracking-tight text-[#26362c] dark:text-white">{materialTypeLabel(demand.materialType)}</h2>
                        <StatusBadge status={demand.status} />
                        {isBestMatch && (
                          <span className="rounded-full bg-[#eaf4ec] px-2.5 py-0.5 text-xs font-semibold text-[#164b2d] dark:bg-[#164b2d]/50 dark:text-[#6ee584]">
                            ★ Best match
                          </span>
                        )}
                        {hasActiveOffer && (
                          <span className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs",
                            existingOffer?.status === "accepted"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          )}>
                            {existingOffer?.status === "accepted" ? "✓ Offer Accepted" : `Under Negotiation (${existingOffer?.offeredQuantityT.toFixed(1)} t)`}
                          </span>
                        )}
                        {demand.targetProviderId === providerId && (
                          <span className="rounded-full bg-loop-100 px-2 py-0.5 text-xs font-semibold text-loop-800 dark:bg-loop-900 dark:text-loop-200">Direct Request</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-[#778078] dark:text-gray-400"><span className="font-semibold text-[#3a4b3e] dark:text-gray-200">{demand.requiredT.toFixed(1)} t {materialTypeLabel(demand.materialType)}</span> · {demand.period}</p>
                      {demand.notes && <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-[#727d74] dark:text-gray-400">{demand.notes}</p>}
                      <details className="mt-1.5 text-[11px] text-[#526b58] dark:text-[#b6cfbd]">
                        <summary className="w-fit cursor-pointer font-semibold">View Match Details <span aria-hidden="true">→</span></summary>
                        <div className="mt-2 text-left">
                          {(() => {
                            const filters = {
                              minimumQuantityT: minimumT ? Number(minimumT) : undefined,
                              maximumBudget: maximumBudget ? Number(maximumBudget) : undefined,
                              neededBy: neededBy || undefined,
                            };
                            const matchCandidates = contextualMatch(dataset, { demandId: demand.id }, filters).filter(c => c.providerId === providerId);
                            const bestMatch = matchCandidates.length > 0 ? matchCandidates[0] : null;
                            if (!bestMatch) return <p className="text-sm text-steel-500">You have no matching materials for this request.</p>;
                            return (
                              <div className="space-y-4">
                                <p className="text-sm text-steel-600 dark:text-gray-300">Analysis against your best available material ({dataset.materials.find(m => m.id === bestMatch.materialId)?.id}):</p>
                                <MatchDetailsPanel match={bestMatch} />
                              </div>
                            );
                          })()}
                        </div>
                      </details>
                    </div>

                    <div className="flex flex-col justify-between gap-3 border-t border-[#eeeae2] bg-[#f7f6f0] p-3 dark:border-steel-800 dark:bg-[#1c2b22] sm:flex-row sm:items-center lg:flex-col lg:items-stretch lg:border-l lg:border-t-0 lg:p-3.5">
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#929990]">Needs</p>
                          <p className="mt-0.5 font-archivo text-base font-bold text-[#26362c] dark:text-white">{demand.requiredT.toFixed(1)} <span className="text-xs font-medium text-[#7e887f]">t</span></p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#929990]">Receiver</p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-[#38483e] dark:text-gray-200">{receiver?.name ?? demand.receiverId}</p>
                        </div>
                        <div className="col-span-2 min-w-0 lg:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#929990]">Location</p>
                          <p className="mt-0.5 truncate text-xs text-[#647168] dark:text-gray-400">{demand.location || receiver?.location || "Location not provided"}</p>
                        </div>
                        {demand.budgetPerT !== undefined && <div className="col-span-2 min-w-0 lg:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#929990]">Budget / tonne</p>
                          <p className="mt-0.5 truncate text-xs text-[#647168] dark:text-gray-400">{formatINRPerT(demand.budgetPerT)}</p>
                        </div>}
                      </div>
                      <div className="flex shrink-0 flex-row gap-2 sm:flex-col lg:mt-2">
                        {hasActiveOffer ? (
                          <Link
                            to={`/app/negotiations/${existingOffer?.id}`}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#144927] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1f6236] dark:bg-[#286a3e] sm:flex-none"
                          >
                            View Negotiation <span aria-hidden="true">→</span>
                          </Link>
                        ) : !isOffering ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDemandId(demand.id);
                              if (availablePassports.length > 0) {
                                const p = availablePassports[0];
                                const committedT = dataset.bookings
                                  .filter((booking) => booking.materialId === p.id && booking.status !== "cancelled")
                                  .reduce((total, booking) => total + booking.tonnesT, 0);
                                const availableT = Math.max(0, p.quantityT - committedT);
                                setSelectedPassportId(p.id);
                                setOfferQuantity(String(Math.min(demand.requiredT, availableT)));
                                setOfferPricePerT(p.pricePerT !== undefined ? String(p.pricePerT) : demand.budgetPerT !== undefined ? String(demand.budgetPerT) : "");
                              } else {
                                setSelectedPassportId("");
                                setOfferQuantity("");
                                setOfferPricePerT("");
                              }
                              setOfferError("");
                            }}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white transition hover:bg-[#274d32] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f3d] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1c2b22] sm:flex-none"
                          >
                            Offer material <span aria-hidden="true">→</span>
                          </button>
                        ) : null}
                        {isOffering && (
                          <button
                            type="button"
                            onClick={() => setSelectedDemandId(null)}
                            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-[#cbd4ca] bg-white px-3 text-xs font-semibold text-[#3f5946] hover:bg-[#f0f4ef] dark:border-steel-700 dark:bg-transparent dark:text-gray-200"
                          >
                            Close offer form
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOffering && (
                    <div className="border-t border-[#e9e6de] bg-white dark:border-steel-800 dark:bg-[#17251d] gl-card-pad">
                      {/* Carried Demand Specifications Banner */}
                      <div className="mb-4 rounded-xl border border-[#dce8db] bg-[#f5f9f4] p-3.5 text-xs dark:border-steel-700 dark:bg-[#1c2c20]">
                        <div className="flex items-center justify-between">
                          <p className="font-archivo text-xs font-bold uppercase tracking-wider text-[#35613d] dark:text-[#a0cca7]">
                            Carried Demand Specifications
                          </p>
                          <span className="text-[10px] text-[#6d7970] dark:text-gray-400">Values prefilled into offer below</span>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div>
                            <span className="text-[#6d7970] dark:text-gray-400">Target Facility:</span>
                            <p className="font-semibold text-[#1e2f23] dark:text-white truncate">{receiver?.name ?? demand.receiverId}</p>
                          </div>
                          <div>
                            <span className="text-[#6d7970] dark:text-gray-400">Destination:</span>
                            <p className="font-semibold text-[#1e2f23] dark:text-white truncate">{demand.location || receiver?.location || "Destination on request"}</p>
                          </div>
                          <div>
                            <span className="text-[#6d7970] dark:text-gray-400">Required Quantity:</span>
                            <p className="font-semibold text-[#1e2f23] dark:text-white">{demand.requiredT.toFixed(1)} t</p>
                          </div>
                          <div>
                            <span className="text-[#6d7970] dark:text-gray-400">Target Timeline:</span>
                            <p className="font-semibold text-[#1e2f23] dark:text-white">{formatDate(demand.period)}</p>
                          </div>
                        </div>
                      </div>

                      <h3 className="font-archivo text-lg font-bold text-[#26362c] dark:text-white">Choose a Material Passport</h3>
                      <p className="mt-1 text-sm text-[#778078] dark:text-gray-400">A Material Passport is your material’s digital record, including its quantity and evidence.</p>
                      {availablePassports.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-[#e8e5dd] bg-[#f8f7f2] p-4 text-sm text-[#667168] dark:border-steel-800 dark:bg-white/[0.03] dark:text-gray-300">
                          <p className="font-semibold text-[#28392d] dark:text-white">
                            No surplus {materialTypeLabel(demand.materialType)} available
                          </p>
                          <p className="mt-1 text-xs">
                            You do not currently have any published material passports with available surplus volume matching this material type.
                          </p>
                          <div className="mt-3">
                            <Link
                              to={`/app/materials/new?type=${encodeURIComponent(demand.materialType)}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#315f3d] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#274d32]"
                            >
                              + Survey &amp; Add {materialTypeLabel(demand.materialType)}
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleOffer} className="mt-4 space-y-4">
                          <fieldset>
                            <legend className="mb-2 text-sm font-semibold text-[#526158] dark:text-gray-300">Choose the material to offer</legend>
                            <div className="grid gap-detail md:grid-cols-2">
                              {availablePassports.map((passport) => {
                                const committedT = dataset.bookings.filter((booking) => booking.materialId === passport.id && booking.status !== "cancelled").reduce((total, booking) => total + booking.tonnesT, 0);
                                const availableT = Math.max(0, passport.quantityT - committedT);
                                const photo = materialMedia(passport)[0];
                                return (
                                  <label key={passport.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${selectedPassportId === passport.id ? "border-[#5c8967] bg-[#eef4ed] dark:bg-[#294334]" : "border-[#e5e2da] bg-white hover:border-[#b9c8ba] dark:border-steel-800 dark:bg-[#17251d]"}`}>
                                    <input
                                      type="radio"
                                      name="passport"
                                      value={passport.id}
                                      checked={selectedPassportId === passport.id}
                                      onChange={() => {
                                        setSelectedPassportId(passport.id);
                                        setOfferQuantity(String(Math.min(demand.requiredT, availableT)));
                                        if (passport.pricePerT !== undefined) {
                                          setOfferPricePerT(String(passport.pricePerT));
                                        }
                                      }}
                                      required
                                      className="mt-1 accent-[#39714b]"
                                    />
                                    {photo && <img src={photo.src} alt={photo.caption} className="size-16 shrink-0 rounded-md object-cover" />}
                                    <span className="min-w-0 text-xs">
                                      <span className="block font-semibold text-[#26362c] dark:text-white">{materialTypeLabel(passport.type)} · {availableT.toFixed(1)} t available</span>
                                      <span className="mt-1 block text-[#778078] dark:text-gray-400">{passport.condition} condition · Grade {passport.grade} · {passport.evidence.length} evidence items</span>
                                      <details className="mt-1 text-xs text-[#526b58] dark:text-[#b6cfbd]"><summary className="cursor-pointer">Passport details</summary><span className="block pt-1 text-[#778078] dark:text-gray-400">Passport ID: {passport.id} · Est. range {passport.quantityRangeT[0]}–{passport.quantityRangeT[1]} t</span></details>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                          <div className="max-w-xs">
                            <label htmlFor={`offer-quantity-${demand.id}`} className="block text-sm font-semibold text-[#526158] dark:text-gray-300">Offer Quantity (t)</label>
                            <input id={`offer-quantity-${demand.id}`} type="number" min="0.1" step="0.1" value={offerQuantity} onChange={(event) => setOfferQuantity(event.target.value)} required max={(() => {
                              const passport = availablePassports.find((item) => item.id === selectedPassportId);
                              const committedT = dataset.bookings.filter((booking) => booking.materialId === selectedPassportId && booking.status !== "cancelled").reduce((total, booking) => total + booking.tonnesT, 0);
                              return passport ? Math.max(0, passport.quantityT - committedT) : "";
                            })()} className="mt-1 block h-10 w-full rounded-lg border border-[#dcded7] bg-white px-3 text-sm text-[#26362c] outline-none focus:border-[#64866d] focus:ring-2 focus:ring-[#64866d]/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                          </div>
                          <div className="max-w-xs">
                            <label htmlFor={`offer-price-${demand.id}`} className="block text-sm font-semibold text-[#526158] dark:text-gray-300">Price per tonne (₹, optional)</label>
                            <input id={`offer-price-${demand.id}`} type="number" min="0.01" step="0.01" value={offerPricePerT} onChange={(event) => setOfferPricePerT(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#dcded7] bg-white px-3 text-sm text-[#26362c] outline-none focus:border-[#64866d] focus:ring-2 focus:ring-[#64866d]/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white" />
                            {offerPricePerT !== "" && offerQuantity !== "" && <p className="mt-1 text-xs text-[#667168] dark:text-gray-400">{formatINRPerT(Number(offerPricePerT))} × {Number(offerQuantity).toLocaleString("en-IN")} t = <strong>{formatINR(Number(offerPricePerT) * Number(offerQuantity))}</strong></p>}
                          </div>
                          {offerError && <p role="alert" className="text-sm text-error-500">{offerError}</p>}
                          <div className="flex flex-wrap gap-2">
                            <Button id="send-offer-btn" size="sm" type="submit" disabled={isSubmittingOffer}>{isSubmittingOffer ? "Sending..." : "Send offer"}</Button>
                            <Button variant="outline" size="sm" type="button" disabled={isSubmittingOffer} onClick={handleSaveOfferDraft}>{isSubmittingOffer ? "Saving..." : "Save Draft"}</Button>
                            <Button variant="outline" size="sm" type="button" onClick={() => setSelectedDemandId(null)}>Cancel</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}
        </div>
      </section>
      )}

      {activeTab === "sent" && (
      <section className="mt-section overflow-hidden border border-[#e5e2da] bg-white dark:border-steel-800 dark:bg-[#17251d] rounded-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eeeae2] px-4 py-4 dark:border-steel-800 sm:px-5">
          <div>
            <h2 className="font-archivo text-xl font-bold text-[#26362c] dark:text-white">Offers you have sent</h2>
            <p className="mt-0.5 text-xs text-[#7c857d] dark:text-gray-400">{myOffers.length ? `${myOffers.length} submitted ${myOffers.length === 1 ? "offer" : "offers"}` : "Your submitted offers will appear here."}</p>
          </div>
        </div>
        {myOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-[#1e4631] dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-[#00e599]">
              <DemandMetricIcon kind="matched" />
            </span>
            <p className="mt-3 font-archivo text-base font-bold text-ink-900 dark:text-white">No offers submitted yet</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-steel-600 dark:text-steel-400">
              Select an open request above and offer your surveyed Material Passports to begin bilateral negotiation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eeeae2] dark:divide-steel-800">
            {myOffers.map((offer) => {
              const demand = dataset.demands.find((item) => item.id === offer.demandId);
              const passport = dataset.materials.find((item) => item.id === offer.passportId);
              const project = passport && dataset.projects.find((item) => item.id === passport.projectId);
              const receiver = demand && dataset.receivers.find((item) => item.id === demand.receiverId);
              const photo = passport && materialMedia(passport)[0];
              return (
                <article key={offer.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                  {photo ? <img src={photo.src} alt={photo.caption} className="size-12 shrink-0 rounded-md object-cover" /> : <img src={materialMediaFor(passport?.type ?? "").src} alt={materialMediaFor(passport?.type ?? "").alt} className="size-12 shrink-0 rounded-md object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#26362c] dark:text-white">{materialTypeLabel(passport?.type ?? "")} · {offer.offeredQuantityT.toFixed(1)} t</p>
                    <p className="mt-0.5 truncate text-xs text-[#778078] dark:text-gray-400">{project?.name ?? passport?.projectId ?? "Project unavailable"} · {receiver?.name ?? demand?.receiverId ?? "Receiver unavailable"}</p>
                  </div>
                  <p className="hidden text-xs text-[#778078] dark:text-gray-400 sm:block">{formatDate(offer.createdAt)}</p>
                  <StatusBadge status={offer.status} />
                  {offer.status === "pending" && <Button size="sm" variant="outline" onClick={() => withdrawOfferAction(offer.id)}>Withdraw offer</Button>}
                  {offer.status === "draft" && <Button size="sm" variant="outline" onClick={() => deleteOfferDraftAction(offer.id)}>Delete Draft</Button>}
                  <details className="basis-full sm:basis-auto">
                    <summary className="cursor-pointer text-xs font-semibold text-[#526b58] dark:text-[#b6cfbd]">View details <span aria-hidden="true">→</span></summary>
                    <p className="mt-2 text-xs text-[#778078] dark:text-gray-400">Offer {offer.id} · Request {offer.demandId} · Passport {offer.passportId} · {formatDate(offer.createdAt)}</p>
                  </details>
                  {offer.status !== "draft" && <Link className="basis-full text-sm font-semibold text-loop-800 underline dark:text-loop-300" to={`/app/negotiations/${offer.id}`}>{t("negotiationOpen")}</Link>}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}

      {activeTab === "receivers" && user?.activeWorkspace !== "receiver" && <ReceiverDiscovery dataset={dataset} />}
      </div>
    </div>
  );
}
