import PageMeta from "@/components/common/PageMeta";
import AddressLocation from "@/components/greenloop/AddressLocation";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import { LocationMap } from "@/components/greenloop/LocationMap";
import { VideoPanel } from "@/components/greenloop/kit";
import MatchDetailsPanel from "@/components/greenloop/MatchDetailsPanel";
import RecordActions from "@/components/greenloop/RecordActions";
import StatusBadge from "@/components/greenloop/StatusBadge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ambientVideo, materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { contextualMatch } from "@shared/domain/capacity";
import { type GeoPoint, type MaterialTypeKey } from "@shared/domain/types";
import { CalenderIcon, FileIcon, MapIcon } from "@/icons";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate, formatINR, formatINRPerT, materialTypeLabel } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Link } from "react-router";
import DemandCapacity from "./DemandCapacity";

const TYPE_LABEL: Record<string, string> = {
  concrete: "Concrete",
  brick: "Brick",
  steel: "Steel",
  timber: "Timber",
  plasterboard: "Plasterboard",
  glass: "Glass",
};

const CUSTOM_TYPE = "__custom__";
const normalizeCustomType = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const requestInputClass = "mt-1.5 block h-10 w-full min-w-0 rounded-lg border border-steel-200 bg-white px-3 font-inter text-sm text-ink-900 shadow-sm outline-none transition focus:border-loop-500 focus:ring-2 focus:ring-loop-500/15 dark:border-steel-700 dark:bg-ink-900 dark:text-white";

export default function Demand() {
  const { t } = useTranslation();
  const { dataset, addDemandAction, saveDemandDraftAction, acceptOfferAction, declineOfferAction, cancelDemandAction, addCapacityAction, updateCapacityAction } = useGreenLoopStore();
  const { user } = useAuth();
  const receiverId = user?.receiverId ?? "";
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get("materialType");
  const targetMaterialId = searchParams.get("targetMaterialId") ?? undefined;
  const [isAdding, setIsAdding] = useState(Boolean(searchParams.get("materialType")));
  const query = searchParams.toString();
  const [expandedOverride, setExpandedOverride] = useState<{ query: string; id: string | null } | null>(null);
  const expandedId = expandedOverride?.query === query ? expandedOverride.id : searchParams.get("demand");
  const defaultNeededDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  };
  const [type, setType] = useState<MaterialTypeKey>(initialType && ["concrete", "brick", "steel", "timber", "plasterboard", "glass"].includes(initialType) ? initialType as MaterialTypeKey : "concrete");
  const [requiredT, setRequiredT] = useState(searchParams.get("quantityT") ?? "50");
  const [period, setPeriod] = useState(searchParams.get("neededBy") || defaultNeededDate());
  const [budgetPerT, setBudgetPerT] = useState(searchParams.get("budgetPerT") ?? "");
  const [error, setError] = useState("");
  const [location, setLocation] = useState(user?.location || user?.organization || "Main Receiving Facility");
  const [geo, setGeo] = useState<GeoPoint | undefined>();
  const [notes, setNotes] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [customName, setCustomName] = useState("");
  const typeValue = type === CUSTOM_TYPE ? normalizeCustomType(customName) : type;
  const addressSources = [...new Set([
    user?.location,
    user?.organization,
    dataset.receivers.find((item) => item.id === receiverId)?.location,
    ...dataset.demands.filter((item) => item.receiverId === receiverId).map((item) => item.location),
  ].filter(Boolean) as string[])];

  const receiverDemands = dataset.demands?.filter((d) => d.receiverId === receiverId && !d.auctionId) ?? [];

  useEffect(() => {
    if (searchParams.get("capacity") === "1") window.setTimeout(() => document.getElementById("receiving-capacity")?.scrollIntoView({ behavior: "smooth" }), 0);
    if (searchParams.get("new") === "1") setIsAdding(true);
  }, [searchParams]);

  useEffect(() => {
    const demandId = searchParams.get("demand");
    if (!demandId || expandedId !== demandId) return;
    const offerId = searchParams.get("offer");
    const timer = window.setTimeout(() => {
      const offer = offerId ? document.getElementById(`offer-${offerId}`) : null;
      offer?.scrollIntoView({ behavior: "smooth", block: "center" });
      offer?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expandedId, searchParams]);

  useEffect(() => {
    const isDrawerOpen = isAdding || Boolean(expandedId);
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isAdding) setIsAdding(false);
      else setExpandedOverride({ query, id: null });
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedId, isAdding, query]);

  const handleAddDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requiredT || !Number.isFinite(Number(requiredT)) || Number(requiredT) <= 0 || !period) {
      setError("Enter a positive quantity and needed-by date.");
      return;
    }
    if (typeValue.length < 2) {
      setError("Enter a material name for the custom material.");
      return;
    }
    setError("");
    const demand = await addDemandAction({
      receiverId,
      materialType: typeValue,
      requiredT: Number(requiredT),
      period: period || "Q4 2026",
      location: location || user?.organization || "Receiving facility",
      notes: notes,
      ...(budgetPerT !== "" ? { budgetPerT: Number(budgetPerT) } : {}),
      ...(geo ? { geo } : {}),
      targetMaterialId,
    });
    
    if (!demand) return;
    setIsAdding(false);
    setSentMessage(t("backend.requestPublished"));
    setRequiredT("");
    setPeriod("");
    setNotes("");
    setBudgetPerT("");
  };

  const handleSaveDemandDraft = async () => {
    if (!requiredT || !Number.isFinite(Number(requiredT)) || Number(requiredT) <= 0 || !period) {
      setError("Enter a positive quantity and needed-by date to save this draft.");
      return;
    }
    if (typeValue.length < 2) {
      setError("Enter a material name for the custom material to save this draft.");
      return;
    }
    setError("");
    const draft = await saveDemandDraftAction({
      receiverId,
      materialType: typeValue,
      requiredT: Number(requiredT),
      period,
      location: location || user?.organization || "Receiving facility",
      notes,
      ...(budgetPerT !== "" ? { budgetPerT: Number(budgetPerT) } : {}),
      ...(geo ? { geo } : {}),
      targetMaterialId,
    });
    if (!draft) return;
    setIsAdding(false);
    setRequiredT(""); setPeriod(""); setNotes(""); setBudgetPerT("");
  };

  const calculateCoveredT = (demandId: string) => {
    return dataset.bookings
      .filter((booking) => booking.demandId === demandId && booking.status === "confirmed")
      .reduce((sum, booking) => sum + booking.tonnesT, 0);
  };
  const totalRequestedT = receiverDemands.reduce((sum, demand) => sum + demand.requiredT, 0);
  const totalReceivedT = receiverDemands.reduce((sum, demand) => sum + calculateCoveredT(demand.id), 0);
  const overallCoverage = totalRequestedT > 0 ? Math.min(100, Math.round(totalReceivedT / totalRequestedT * 100)) : 0;

  return (
    <div className="relative min-h-screen bg-[#f6f5f0] pb-16 text-[#26342b] dark:bg-[#101913] dark:text-[#f2f3ef]">
      <PageMeta title="Request Material | GreenLoop" description="Publish material requirements and receiving capacity for your facility." />
      <section className="relative">
        <VideoPanel
          video={ambientVideo.receiverDemand}
          aspect="min-h-[330px] sm:min-h-[360px] lg:min-h-[385px]"
          className="rounded-none border-0 shadow-none"
          scrim="bg-gradient-to-r from-[#10251a]/95 via-[#10251a]/75 to-[#10251a]/30"
        >
          <div className="relative z-10 flex h-full flex-col justify-center px-5 pb-8 pt-20 sm:px-9 sm:pt-24 lg:px-12 xl:px-16">
            <p className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8e5d9] backdrop-blur-sm sm:text-xs">Receiver operations</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <h1 className="font-archivo text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-[3.5rem]">Request <span className="text-[#6ee584]">Material</span></h1>
              </div>
              <button
                type="button"
                id="request-material-btn"
                onClick={() => { setIsAdding(true); setSentMessage(""); }}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/70 bg-[#062b20]/90 px-3.5 text-[11px] font-medium text-white shadow-md backdrop-blur-sm transition hover:border-white hover:bg-[#0b3b2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span aria-hidden="true" className="text-base leading-none">+</span>
                Request material
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-white">
              <div><p className="font-archivo text-xl font-bold">{receiverDemands.length}</p><p className="text-[11px] text-white/75">Requests published</p></div>
              <div><p className="font-archivo text-xl font-bold">{totalRequestedT.toLocaleString("en-IN", { maximumFractionDigits: 1 })} t</p><p className="text-[11px] text-white/75">Material requested</p></div>
              <div><p className="font-archivo text-xl font-bold">{overallCoverage}%</p><p className="text-[11px] text-white/75">Average coverage</p></div>
            </div>
          </div>
        </VideoPanel>
      </section>

      {sentMessage && <p role="status" className="mx-auto mb-4 mt-4 max-w-[1120px] border-l-4 border-loop-500 bg-loop-50 px-4 py-3 text-sm font-medium text-loop-800 dark:bg-loop-500/10 dark:text-loop-200 sm:mx-6 lg:mx-auto">{sentMessage}</p>}

      {/* Add Demand Form */}
      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} showCloseButton={false} className="mx-4 max-h-[90dvh] max-w-xl overflow-y-auto p-5 font-inter shadow-2xl sm:p-6">
          <div id="request-form" role="dialog" aria-modal="true" aria-labelledby="request-form-title">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-steel-200 pb-4 dark:border-steel-800">
              <div><p className="text-xs font-semibold text-loop-700 dark:text-loop-300">New request</p><h2 id="request-form-title" className="mt-1 font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">Tell providers what you need</h2></div>
              <button type="button" aria-label="Close request form" onClick={() => setIsAdding(false)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xl text-steel-500 transition hover:bg-steel-100 focus-visible:outline-2 focus-visible:outline-loop-500 dark:text-steel-400 dark:hover:bg-steel-800">×</button>
            </div>
            <form onSubmit={handleAddDemand} className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <label htmlFor="request-material" className="block text-sm font-medium text-steel-700 dark:text-gray-300">Material Type</label>
                <select
                  id="request-material"
                  autoFocus
                  value={type}
                  onChange={(e) => setType(e.target.value as MaterialTypeKey)}
                  className={requestInputClass}
                >
                  {Object.entries(TYPE_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                  <option value={CUSTOM_TYPE}>Other / custom material…</option>
                </select>
                {type === CUSTOM_TYPE && (
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Material name, e.g. roof tiles"
                    aria-label="Custom material name"
                    required
                    className={requestInputClass}
                  />
                )}
              </div>

              <div>
                <label htmlFor="request-quantity" className="block text-sm font-medium text-steel-700 dark:text-gray-300">Required Quantity (t)</label>
                <input
                  id="request-quantity"
                  type="number"
                  value={requiredT}
                  onChange={(e) => setRequiredT(e.target.value)}
                  placeholder="e.g. 50"
                  required
                  min="0.1"
                  step="0.1"
                  className={requestInputClass}
                />
                <div className="mt-1.5 flex gap-1.5">
                  {[10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRequiredT(String(preset))}
                      className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px] font-semibold text-steel-700 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-200"
                    >
                      {preset}t
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="request-date" className="block text-sm font-medium text-steel-700 dark:text-gray-300">Needed By</label>
                <input
                  id="request-date"
                  type="date"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="e.g. Q4 2026, Oct 2026"
                  required
                  className={requestInputClass}
                />
                <p className="mt-1 text-[11px] text-steel-500 dark:text-steel-400">Default: 14 days lead time</p>
              </div>

              <div>
                <label htmlFor="request-budget" className="block text-sm font-medium text-steel-700 dark:text-gray-300">Budget per tonne (₹, optional)</label>
                <input id="request-budget" type="number" min="0" step="1" value={budgetPerT} onChange={(event) => setBudgetPerT(event.target.value)} className={requestInputClass} />
              </div>

              <div className="sm:col-span-2">
                <AddressLocation
                  label="Receiving Location"
                  required
                  address={location}
                  onAddressChange={setLocation}
                  geo={geo}
                  onGeoChange={setGeo}
                  sources={addressSources}
                  placeholder="Search receiving address…"
                  inputClassName="rounded-lg border border-steel-200 ps-9 pe-3 focus:ring-2 focus:ring-loop-500/15 dark:bg-ink-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="request-notes" className="block text-sm font-medium text-steel-700 dark:text-gray-300">Notes (Optional)</label>
                <input
                  id="request-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Specific grade requirements"
                  className={requestInputClass}
                />
              </div>

              {error && <p role="alert" className="text-sm text-error-500 sm:col-span-2">{error}</p>}
              <div className="flex flex-wrap gap-2 border-t border-steel-200 pt-4 sm:col-span-2 dark:border-steel-800">
                <Button size="sm" className="rounded-lg" type="submit">Send request</Button>
                <Button size="sm" className="rounded-lg" variant="outline" type="button" onClick={handleSaveDemandDraft}>Save Draft</Button>
                <Button size="sm" className="rounded-lg" variant="outline" type="button" onClick={() => { setIsAdding(false); setRequiredT(""); setPeriod(""); setBudgetPerT(""); setNotes(""); setError(""); }}>Discard</Button>
              </div>
            </form>
          </div>
      </Modal>

      {/* Demand List */}
      {receiverDemands.length === 0 ? (
        <div className="mx-auto flex min-h-[32vh] max-w-5xl flex-col items-center justify-center border border-dashed border-steel-300 bg-steel-50/50 p-8 text-center dark:border-steel-800 dark:bg-white/[0.01] rounded-surface">
          <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">No active material demand</h2>
          <p className="mt-2 max-w-md text-steel-600 dark:text-gray-400">
            Publish a material request to tell GreenLoop what you need and start matching with recovery projects.
          </p>
          <div className="mt-6">
            <Button size="md" onClick={() => setIsAdding(true)}>Request Material</Button>
          </div>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1120px] gap-3 px-4 pt-5 sm:px-6 lg:pt-7">
          {receiverDemands.map((demand, i) => {
            const coveredT = calculateCoveredT(demand.id);
            const heldT = dataset.bookings.filter((booking) => booking.demandId === demand.id && booking.status === "hold")
              .reduce((total, booking) => total + booking.tonnesT, 0);
            const remainingT = Math.max(0, demand.requiredT - coveredT);
            const percentCovered = Math.min(100, (coveredT / demand.requiredT) * 100);
            const media = materialMediaFor(demand.materialType);
            const typeLabel = materialTypeLabel(demand.materialType);
            const isExpanded = expandedId === demand.id;
            const requestOffers = dataset.offers?.filter(offer => offer.demandId === demand.id && ["pending", "accepted"].includes(offer.status)) ?? [];

            return (
              <Fragment key={demand.id}>
              <motion.article
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={demand.id}
                id={`demand-${demand.id}`}
                className="group overflow-hidden rounded-2xl border border-[#e8e7df] bg-white shadow-[0_5px_18px_rgba(31,48,37,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#9fbea5] hover:shadow-[0_12px_28px_rgba(31,48,37,0.1)] dark:border-steel-800 dark:bg-white/[0.03]"
              >
                <div className="grid gap-3 p-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4 sm:p-4">
                  <img src={media.src} alt={media.alt} loading="lazy" className="h-24 w-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-[1.02] sm:h-28 sm:w-28" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-archivo text-lg font-bold leading-tight text-[#24352a] dark:text-white">{typeLabel}</h2>
                        <p className="mt-1 text-xs text-[#768078] dark:text-gray-400">
                          <span>{/^\d{4}-\d{2}-\d{2}$/.test(demand.period) ? formatDate(demand.period) : demand.period}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{demand.location}</span>
                        </p>
                      </div>
                      <StatusBadge status={demand.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-5">
                      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#858d86]">Requested</p><p className="mt-0.5 text-sm font-bold text-[#29392f] dark:text-white">{demand.requiredT.toFixed(1)} t</p></div>
                      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#858d86]">Received</p><p className="mt-0.5 text-sm font-bold text-[#218253]">{coveredT.toFixed(1)} t</p></div>
                      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#858d86]">Remaining</p><p className="mt-0.5 text-sm font-bold text-[#29392f] dark:text-white">{remainingT.toFixed(1)} t</p></div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e8e9e5]" role="img" aria-label={`${percentCovered.toFixed(0)}% of the request covered`}>
                        <div className="h-full rounded-full bg-[#269766] transition-all duration-500" style={{ width: `${percentCovered}%` }} />
                      </div>
                      <span className="w-9 text-right text-[11px] font-semibold text-[#5c675f] dark:text-gray-300">{percentCovered.toFixed(0)}%</span>
                      <Link
                        to={`/app/receiver/providers?materialType=${encodeURIComponent(demand.materialType)}&quantityT=${remainingT > 0 && coveredT > 0 ? remainingT.toFixed(1) : demand.requiredT}&budgetPerT=${demand.budgetPerT ?? ""}&neededBy=${encodeURIComponent(demand.period ?? "")}`}
                        className="ml-2 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-[#2e5e39] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#234a2c] dark:bg-[#437b50] dark:hover:bg-[#529362]"
                      >
                        Find Matching Materials {remainingT > 0 && coveredT > 0 ? `(${remainingT.toFixed(1)}t balance)` : ""} <span aria-hidden="true">→</span>
                      </Link>
                      <button type="button" onClick={() => setExpandedOverride({ query, id: demand.id })} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-[#b9cbbd] px-3 text-xs font-semibold text-[#294934] transition hover:bg-[#eff5ef] dark:border-steel-600 dark:text-loop-300 dark:hover:bg-white/5">
                        View details <span aria-hidden="true">→</span>
                      </button>
                    </div>
                    {heldT > 0 && <p className="mt-1 text-[11px] text-[#7d857e]">{heldT.toFixed(1)} t waiting on capacity</p>}
                  </div>
                </div>
              </motion.article>
              <AnimatePresence>
              {isExpanded && (
              <>
              <motion.button type="button" aria-label="Close request details" onClick={() => setExpandedOverride({ query, id: null })} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] cursor-default bg-[#101a13]/45 backdrop-blur-[2px]" />
              <motion.article
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 300 }}
                key={`details-${demand.id}`}
                id={`demand-${demand.id}-details`}
                role="dialog"
                aria-modal="true"
                aria-label={`${typeLabel} request details`}
                className="fixed inset-y-0 right-0 z-[81] w-full overflow-y-auto border-l border-[#e8e7df] bg-[#fffefa] shadow-2xl dark:border-steel-800 dark:bg-[#111b14] sm:max-w-[620px]"
              >
                {/* Hero material image — what this facility needs */}
                <figure className="relative h-40 w-full overflow-hidden sm:h-52">
                  <img src={media.src} alt={media.alt} loading="lazy" className="size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-ink-950/25 to-ink-950/10" aria-hidden="true" />
                  <button type="button" aria-label="Close request details" onClick={() => setExpandedOverride({ query, id: null })} className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-white/40 bg-ink-950/35 text-2xl leading-none text-white backdrop-blur-sm transition hover:bg-ink-950/65">×</button>
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between px-5 pb-4 sm:px-7 sm:pb-5">
                    <span className="font-archivo text-lg font-bold uppercase tracking-wide text-white sm:text-xl">{typeLabel}</span>
                    <span className="ledger-numeral text-base font-bold text-white/95 sm:text-lg">{demand.requiredT.toFixed(1)} t</span>
                  </figcaption>
                </figure>

                <div className="p-5 sm:p-7">
                  {/* Request identity + headline quantities */}
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="eyebrow-label text-steel-500 dark:text-steel-400">Material request · {demand.id}</p>
                      <h3 className="mt-1.5 font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">{typeLabel}</h3>
                      <p className="mt-1.5 text-sm text-steel-600 dark:text-gray-400">
                        <span className="font-semibold text-ink-900 dark:text-gray-200">{/^\d{4}-\d{2}-\d{2}$/.test(demand.period) ? formatDate(demand.period) : demand.period}</span> · {demand.location}
                      </p>
                      {demand.targetMaterialId && <p className="mt-2 text-sm font-semibold text-loop-700 dark:text-loop-300">{t("directRequest.recipient", { provider: demand.targetProviderName ?? dataset.providerListings?.find(item => item.materialId === demand.targetMaterialId)?.organization ?? "Provider", reference: demand.targetMaterialId })}</p>}
                    </div>

                    <div className="flex flex-wrap items-start gap-x-12 gap-y-5">
                      <div>
                        <p className="eyebrow-label text-steel-500 dark:text-steel-400">Requested</p>
                        <p className="ledger-numeral mt-2 text-3xl font-bold tracking-tight text-ink-900 dark:text-white">
                          {demand.requiredT.toFixed(1)} <span className="text-xl font-bold text-steel-400">t</span>
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow-label text-steel-500 dark:text-steel-400">Received</p>
                        <p className="ledger-numeral mt-2 text-3xl font-bold tracking-tight text-loop-600 dark:text-loop-400">{coveredT.toFixed(1)} <span className="text-xl font-bold text-steel-400">t</span></p>
                      </div>
                      <div>
                        <p className="eyebrow-label text-steel-500 dark:text-steel-400">Remaining</p>
                        <p className="ledger-numeral mt-2 text-3xl font-bold tracking-tight text-ink-900 dark:text-white">{remainingT.toFixed(1)} <span className="text-xl font-bold text-steel-400">t</span></p>
                        {heldT > 0 && <p className="mt-1 text-xs text-steel-500 dark:text-gray-400">{heldT.toFixed(1)} t waiting on capacity</p>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-end">
                      <StatusBadge status={demand.status} />
                      <RecordActions kind="request" id={demand.id} />
                      {(["OPEN", "PARTIALLY_COVERED"].includes(demand.status) && !dataset.bookings.some((booking) => booking.demandId === demand.id && booking.status !== "cancelled")) && <Button size="sm" variant="outline" onClick={() => cancelDemandAction(demand.id)}>Cancel Request</Button>}
                      <button
                        type="button"
                        onClick={() => setExpandedOverride({ query, id: null })}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-steel-600 transition-colors hover:bg-steel-100 hover:text-ink-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        Close details <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  </div>

                  {/* Coverage — engine output, never hardcoded */}
                  <div className="mt-section border-t border-steel-100 pt-5 dark:border-steel-800/60">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-steel-700 dark:text-gray-300">Coverage from confirmed slots</span>
                      <span className="ledger-numeral font-bold text-ink-900 dark:text-white">{coveredT.toFixed(1)} t covered</span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-steel-100 dark:bg-steel-800" role="img" aria-label={`${percentCovered.toFixed(0)}% of the request covered`}>
                      <div
                        className={cn("h-full rounded-full transition-all", percentCovered === 100 ? "bg-loop-500" : "bg-loop-400 dark:bg-loop-500")}
                        style={{ width: `${percentCovered}%` }}
                      />
                    </div>
                  </div>

                  {/* Expandable request information */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-5 grid gap-5 border-t border-steel-100 pt-5 sm:grid-cols-3 sm:gap-0 dark:border-steel-800/60">
                          <div className="flex items-start gap-3 sm:pr-6">
                            <CalenderIcon className="mt-0.5 size-5 shrink-0 text-steel-500 dark:text-steel-400" />
                            <div>
                              <p className="eyebrow-label text-steel-500 dark:text-steel-400">Required by</p>
                              <p className="mt-1.5 text-sm font-semibold text-ink-900 dark:text-white">{demand.period}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 sm:border-l sm:border-steel-100 sm:px-6 dark:sm:border-steel-800/60">
                            <MapIcon className="mt-0.5 size-5 shrink-0 text-steel-500 dark:text-steel-400" />
                            <div>
                              <p className="eyebrow-label text-steel-500 dark:text-steel-400">Receiving facility</p>
                              <p className="mt-1.5 text-sm font-semibold text-ink-900 dark:text-white">{demand.location}</p>
                              {demand.geo && <LocationMap geo={demand.geo} className="mt-3 h-40" />}
                            </div>
                          </div>
                          <div className="flex items-start gap-3 sm:border-l sm:border-steel-100 sm:pl-6 dark:sm:border-steel-800/60">
                            <FileIcon className="mt-0.5 size-5 shrink-0 text-steel-500 dark:text-steel-400" />
                            <div>
                              <p className="eyebrow-label text-steel-500 dark:text-steel-400">Budget per tonne</p>
                              <p className="mt-1.5 text-sm font-semibold text-ink-900 dark:text-white">{demand.budgetPerT !== undefined ? `₹${demand.budgetPerT.toLocaleString("en-IN")}/tonne` : "Not specified"}</p>
                            </div>
                          </div>
                        </div>

                        {(
                          <div className="mt-5 border border-steel-200 bg-steel-50/70 p-4 dark:border-steel-800 dark:bg-white/[0.03] rounded-surface">
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Description</p>
                            <p className="mt-1.5 text-sm leading-relaxed text-ink-800 dark:text-gray-200">{demand.notes || "No additional description provided."}</p>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c5dac9] bg-[#f4f9f5] p-3.5 dark:border-steel-700 dark:bg-[#15251a]">
                          <div>
                            <p className="text-xs font-bold text-[#1f4728] dark:text-[#8fe0a4]">Compatible Materials in Market</p>
                            <p className="mt-0.5 text-xs text-[#516b57] dark:text-gray-300">Automatically ranked by suitability, landed cost, and distance for this demand.</p>
                          </div>
                          <Link
                            to={`/app/receiver/providers?materialType=${encodeURIComponent(demand.materialType)}&quantityT=${remainingT > 0 && coveredT > 0 ? remainingT.toFixed(1) : demand.requiredT}&budgetPerT=${demand.budgetPerT ?? ""}&neededBy=${encodeURIComponent(demand.period ?? "")}`}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#2e5e39] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#234a2c] dark:bg-[#437b50]"
                          >
                            Browse Matching Providers {remainingT > 0 && coveredT > 0 ? `(${remainingT.toFixed(1)}t balance)` : ""} →
                          </Link>
                        </div>

                        <p className="ledger-numeral mt-4 text-xs text-steel-500 dark:text-gray-400">Request ID: {demand.id}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <DemandCapacity demand={demand} dataset={dataset} receiverId={receiverId} addCapacityAction={addCapacityAction} updateCapacityAction={updateCapacityAction} />
                  {/* Offers — real provider proposals on this request */}
                  {requestOffers.length > 0 && (
                    <div className="mt-6 border border-loop-200 bg-loop-50/50 p-4 dark:border-loop-900/30 dark:bg-loop-900/10 rounded-surface">
                      <h4 className="mb-3 font-archivo text-sm font-bold text-ink-900 dark:text-white">
                        Confirmed Offers ({requestOffers.filter(offer => offer.status === "accepted").length}) · Pending proposals ({requestOffers.filter(offer => offer.status === "pending").length})
                      </h4>
                      <div className="space-y-3">
                  {requestOffers.map(offer => {
                          const passport = dataset.materials.find((material) => material.id === offer.passportId);
                          const photo = passport ? materialMedia(passport)[0] : undefined;
                          const receiverDistanceKm = dataset.receivers.find((item) => item.id === demand.receiverId)?.distanceKm;
                          const matchCandidates = contextualMatch(dataset, { demandId: demand.id, offerId: offer.id });
                          const bestMatch = matchCandidates.length > 0 ? matchCandidates[0] : null;
                          return (
                            <div key={offer.id} id={`offer-${offer.id}`} tabIndex={-1} className={cn("scroll-mt-24 flex flex-col gap-3 rounded-lg border border-steel-100 bg-white p-4 transition-colors hover:border-steel-400 dark:border-steel-800 dark:bg-gray-900 dark:hover:border-steel-600 sm:flex-row sm:items-start sm:justify-between sm:flex-wrap", searchParams.get("offer") === offer.id && "ring-2 ring-loop-500")}>
                              <div className="flex min-w-0 flex-1 gap-3">
                                {photo && <img src={photo.src} alt={photo.caption} className="size-20 shrink-0 rounded-md object-cover" />}
                                <div>
                                  <p className="text-sm font-semibold text-ink-900 dark:text-gray-100">Provider offer · {receiverDistanceKm ?? "—"} km away</p>
                                  <p className="mt-1 font-archivo text-lg font-bold text-ink-900 dark:text-white">{offer.offeredQuantityT.toFixed(1)} t {materialTypeLabel(passport?.type ?? demand.materialType)}</p>
                                  <p className="text-sm text-steel-600 dark:text-gray-400">{passport?.condition ?? "Details unavailable"} condition · Grade {passport?.grade ?? "—"} · {passport?.evidence.length ?? 0} Evidence items</p>
                                  <p className="mt-1 text-sm font-semibold text-ink-900 dark:text-white">{offer.pricePerT !== undefined ? <>{formatINRPerT(offer.counters?.at(-1)?.pricePerT ?? offer.pricePerT)} · Total {formatINR((offer.counters?.at(-1)?.pricePerT ?? offer.pricePerT) * offer.offeredQuantityT)}</> : "Price on request"}</p>
                                  <details className="mt-2 text-xs text-steel-500"><summary className="cursor-pointer">View details ▾</summary><span className="mt-1 block">Provider: {offer.providerId} · Material Passport: {offer.passportId} · Offer: {offer.id}</span>{passport?.evidence.map((item) => <span key={`${offer.id}-${item.label}`} className="mt-1 block">Evidence: {item.label}</span>)}</details>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 sm:flex-col sm:w-32">
                                <StatusBadge status={offer.status} />
                                {offer.status === "pending" && (
                                  <>
                                    <Button size="sm" className="min-h-11 w-full" onClick={() => void acceptOfferAction(offer.id)}>Accept offer</Button>
                                    <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-ink-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-ink-900" to={`/app/negotiations/${offer.id}`}>{t("negotiationReview")}</Link>
                                    <Button size="sm" className="min-h-11 w-full" variant="outline" onClick={() => declineOfferAction(offer.id)}>Decline</Button>
                                  </>
                                )}
                                {offer.status === "accepted" && (() => {
                                  const linkedBooking = dataset.bookings.find(b => (b.offerId === offer.id || (b.demandId === demand.id && b.materialId === offer.passportId)) && b.status !== "cancelled");
                                  return (
                                    <>
                                      {linkedBooking ? (
                                        <Link
                                          to={`/app/orders/${linkedBooking.id}`}
                                          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#164b2d] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#23633e] dark:bg-[#2f6641]"
                                        >
                                          View Order →
                                        </Link>
                                      ) : (
                                        <Link
                                          to="/app/bookings-deliveries"
                                          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-amber-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
                                        >
                                          Schedule Slot →
                                        </Link>
                                      )}
                                      <Link
                                        to={`/app/negotiations/${offer.id}`}
                                        className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-steel-300 px-3 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:text-steel-200"
                                      >
                                        Final Terms →
                                      </Link>
                                    </>
                                  );
                                })()}
                              </div>
                              
                              <details className="mt-1 basis-full"><summary className="cursor-pointer text-xs font-semibold text-loop-700 dark:text-loop-300">View Match Analysis</summary>
                                <div className="mt-3 text-left">
                                  {bestMatch ? (
                                    <div className="space-y-4">
                                      <p className="text-sm text-steel-600 dark:text-gray-300">Analysis against your requirement:</p>
                                      <MatchDetailsPanel match={bestMatch} />
                                    </div>
                                  ) : <p className="text-sm text-steel-500">Match analysis unavailable.</p>}
                                </div>
                              </details>
                              <div className="mt-1 basis-full"><Link className="text-sm font-semibold text-loop-800 underline dark:text-loop-300" to={`/app/negotiations/${offer.id}`}>{t("negotiationOpen")}</Link></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.article>
              </>
              )}
              </AnimatePresence>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
