import PageMeta from "@/components/common/PageMeta";
import { useAuth } from "@/context/AuthContext.helpers";
import { slotMatchesDemandPeriod } from "@shared/domain/capacity";
import { calculateLandedCost } from "@shared/domain/landedCost";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate, formatINRPerT, materialTypeLabel } from "@/utils";
import { useMemo, useState, useRef, useEffect, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import Button from "@/components/ui/button/Button";
import LandedCostCard from "@/components/greenloop/LandedCostCard";
import { Modal } from "@/components/ui/modal";
import { materialMediaFor } from "@/config/appMedia";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import ReceiverCheckoutModal from "@/components/greenloop/ReceiverCheckoutModal";

type ActiveTab = "conversation" | "offer_terms" | "material_details" | "documents" | "activity";

export default function NegotiationPage() {
  const { t } = useTranslation();
  const { offerId = "" } = useParams();
  const { user, setActiveWorkspace } = useAuth();
  const {
    dataset,
    sendNegotiationMessageAction,
    proposeFinalTermsAction,
    approveFinalTermsAction,
    declineOfferAction,
  } = useGreenLoopStore();

  const offer = dataset.offers?.find((item) => item.id === offerId);
  const demand = dataset.demands.find((item) => item.id === offer?.demandId);
  const material = dataset.materials.find((item) => item.id === offer?.passportId);
  const project = dataset.projects.find((p) => p.id === material?.projectId);
  const rawConversation = dataset.negotiations?.find((item) => item.offerId === offerId);
  const conversation = useMemo(() => {
    if (rawConversation) return rawConversation;
    if (!offer) return undefined;
    return {
      offerId,
      status: "negotiating" as const,
      messages: [],
      proposals: [],
    };
  }, [rawConversation, offerId, offer]);
  const proposal = conversation?.proposals.at(-1);
  const slot = dataset.slots.find((item) => item.id === proposal?.slotId);
  const booking = dataset.bookings.find(
    (b) =>
      (b.offerId === offerId ||
        (demand && material && b.demandId === demand.id && b.materialId === material.id)) &&
      b.status !== "cancelled",
  );

  const isProvider = user?.activeWorkspace === "provider";
  const isDealProvider = user?.email === offer?.providerId;
  const isDealReceiver = user?.receiverId === demand?.receiverId;
  const expectedRole = isDealProvider ? "provider" : isDealReceiver ? "receiver" : null;
  const isWrongWorkspace = expectedRole !== null && user?.activeWorkspace !== expectedRole;

  // Tabs state
  const [activeTab, setActiveTab] = useState<ActiveTab>("conversation");

  // Accordion state for right sidebar
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    currentOffer: true,
    landedCost: true,
    materialSpecs: false,
    evidence: false,
    partyInfo: false,
  });

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Chat message & interaction state
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Offer creation / counteroffer modal state
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerModalMode, setOfferModalMode] = useState<"create" | "counter">("create");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [offerQuantity, setOfferQuantity] = useState<number>(10);
  const [offerPrice, setOfferPrice] = useState<number>(4900);
  const [offerDeliveryCharges, setOfferDeliveryCharges] = useState<number>(20000);
  const [offerSlotOption, setOfferSlotOption] = useState<string>("unscheduled");
  const [offerCustomDate, setOfferCustomDate] = useState<string>("");
  const [offerPaymentTerms, setOfferPaymentTerms] = useState<string>("50% advance, 50% on delivery");
  const [offerValidity, setOfferValidity] = useState<string>("7 days");
  const [offerTaxOption, setOfferTaxOption] = useState<string>("included");

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat on new message or proposals
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, conversation?.proposals, activeTab]);

  const compatibleSlots = useMemo(
    () =>
      dataset.slots
        .filter(
          (item) =>
            item.receiverId === demand?.receiverId &&
            item.materialType === material?.type &&
            item.date >= new Date().toISOString().slice(0, 10) &&
            demand &&
            slotMatchesDemandPeriod(item, demand.period),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dataset.slots, demand, material],
  );

  if (dataset.materials.length === 0 && dataset.demands.length === 0) {
    return (
      <main className="mx-auto flex min-h-[400px] max-w-3xl items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-xs text-steel-500">Loading negotiation workspace...</p>
        </div>
      </main>
    );
  }

  if (!offer || !demand || !material || !conversation) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <PageMeta
          title={`${t("negotiation.title")} | GreenLoop`}
          description={t("negotiation.subtitle")}
        />
        <div className="rounded-2xl border border-steel-200 bg-white p-8 text-center dark:border-steel-800 dark:bg-[#122319]">
          <h1 className="font-archivo text-2xl font-bold text-ink-900 dark:text-white">
            {t("negotiation.unavailable")}
          </h1>
          <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">
            This negotiation thread or linked records could not be found.
          </p>
          <Link
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-loop-800 px-4 py-2 text-sm font-semibold text-white hover:bg-loop-700 dark:bg-loop-600 dark:hover:bg-loop-500"
            to={isProvider ? "/app/market-demand" : "/app/receiver/demand"}
          >
            ← {t("negotiation.back")}
          </Link>
        </div>
      </main>
    );
  }

  const isClosed = offer.status !== "pending" || Boolean(booking);
  const canPropose = !isClosed && (isProvider || user?.activeWorkspace === "receiver");
  const approvedByMe = isProvider
    ? Boolean(proposal?.providerApprovedAt)
    : Boolean(proposal?.receiverApprovedAt);
  const awaitingMe =
    proposal?.status ===
    (isProvider ? "awaiting_provider_approval" : "awaiting_receiver_approval");

  const committedMaterialT = material
    ? dataset.bookings
        .filter((b) => b.materialId === material.id && b.status !== "cancelled" && b.offerId !== offerId)
        .reduce((sum, b) => sum + b.tonnesT, 0)
    : 0;
  const committedDemandT = demand
    ? dataset.bookings
        .filter((b) => b.demandId === demand.id && b.status !== "cancelled" && b.offerId !== offerId)
        .reduce((sum, b) => sum + b.tonnesT, 0)
    : 0;
  const availableMaterialT = material ? Math.max(0, material.quantityT - committedMaterialT) : 0;
  const remainingDemandT = demand ? Math.max(0, demand.requiredT - committedDemandT) : 0;
  const maxAvailableQuantityT = Math.min(availableMaterialT, remainingDemandT);

  const activeReceiver = dataset.receivers.find((r) => r.id === demand.receiverId);
  const currentPrice = proposal?.pricePerT ?? offer.agreedPricePerT ?? offer.counters?.at(-1)?.pricePerT ?? (offer.pricePerT && offer.pricePerT > 0 ? offer.pricePerT : (material.pricePerT && material.pricePerT > 0 ? material.pricePerT : 4900));
  const currentQuantity = proposal?.quantityT ?? offer.offeredQuantityT ?? Math.min(demand.requiredT, material.quantityT);
  const estimatedDeliveryFee = 20000;
  const activeLandedCalc = calculateLandedCost({
    materialType: material.type,
    quantityT: currentQuantity,
    pricePerT: currentPrice,
    distanceKm: activeReceiver?.distanceKm || 25,
    distanceKnown: true,
    materialId: material.id,
    destination: proposal?.destination || demand.location,
  });

  const mediaList = materialMedia(material);
  const materialImage = mediaList[0]?.src || materialMediaFor(material.type).src;

  // Open modal with prefilled data
  const openCreateOrCounterModal = (mode: "create" | "counter") => {
    setOfferModalMode(mode);
    setOfferQuantity(proposal ? proposal.quantityT : (offer.offeredQuantityT || Math.min(demand.requiredT, maxAvailableQuantityT)));
    setOfferPrice(proposal ? proposal.pricePerT : (material.pricePerT && material.pricePerT > 0 ? material.pricePerT : 4900));
    setOfferDeliveryCharges(20000);
    if (proposal?.slotId) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(proposal.slotId)) {
        setOfferSlotOption("custom");
        setOfferCustomDate(proposal.slotId);
      } else {
        setOfferSlotOption(proposal.slotId);
      }
    } else {
      setOfferSlotOption("unscheduled");
    }
    setOfferPaymentTerms("50% advance, 50% on delivery");
    setOfferValidity("7 days");
    setShowOfferModal(true);
  };

  // Submit standard chat message (Message only - does NOT accept or bind terms)
  const submitMessage = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!message.trim() || isSubmittingMessage) return;
    setIsSubmittingMessage(true);
    try {
      const ok = await sendNegotiationMessageAction(offerId, message.trim());
      if (ok) setMessage("");
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  // Submit Formal Offer / Final Terms proposal
  const handleFormalOfferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmittingOffer) return;
    if (!(offerQuantity > 0) || !(offerPrice > 0) || !demand.location) return;

    const finalSlot = offerSlotOption === "custom" ? (offerCustomDate || "unscheduled") : (offerSlotOption || "unscheduled");

    setIsSubmittingOffer(true);
    try {
      const ok = await proposeFinalTermsAction(offerId, {
        quantityT: offerQuantity,
        pricePerT: offerPrice,
        destination: demand.location,
        slotId: finalSlot,
      });

      if (ok) {
        // Also add an audit message in chat indicating the formal offer
        const nextVer = conversation.proposals.length + 1;
        const slotText = finalSlot === "unscheduled" ? "Within 5 days (Flexible)" : formatDate(finalSlot);
        const taxAmount = offerTaxOption === "plus18" ? Math.round((offerQuantity * offerPrice) * 0.18) : 0;
        const taxText = offerTaxOption === "plus18" ? `Taxes: ₹${taxAmount.toLocaleString("en-IN")} (18% GST).` : "Taxes: Included in unit rate (GST compliant invoice).";
        await sendNegotiationMessageAction(
          offerId,
          `We can provide ${offerQuantity} tonnes of ${materialTypeLabel(material.type)} at ₹${offerPrice.toLocaleString("en-IN")} per tonne. Delivery charges: ₹${offerDeliveryCharges.toLocaleString("en-IN")} (within 25 km). ${taxText} Delivery: ${slotText}. Payment terms: ${offerPaymentTerms}.`
        );

        setNotice({
          text: `Final Terms Proposal (Version ${nextVer}) has been dispatched to the counterparty.`,
          type: "success",
        });
        setShowOfferModal(false);
      }
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // Approve formal proposal
  const approve = async () => {
    if (!proposal || isApproving) return;
    setIsApproving(true);
    try {
      const result = await approveFinalTermsAction(offerId, proposal.id);
      if (result?.capacityIssue) {
        setNotice({ text: result.capacityIssue, type: "error" });
      } else if (result?.status === "confirmed") {
        setNotice({ text: "Agreed terms accepted! Order has been established.", type: "success" });
        if (!isProvider) {
          setShowPaymentModal(true);
        }
      } else if (result?.status === "holding") {
        setNotice({
          text: "Both parties approved Final Terms. Order is held awaiting intake scheduling.",
          type: "success",
        });
      } else if (result) {
        setNotice({ text: t("negotiation.approvalSaved"), type: "info" });
      }
    } finally {
      setIsApproving(false);
    }
  };

  // Decline offer
  const handleDecline = async () => {
    if (isDeclining) return;
    setIsDeclining(true);
    try {
      const ok = await declineOfferAction(offerId);
      if (ok) {
        await sendNegotiationMessageAction(
          offerId,
          `The proposed terms for Version ${proposal?.version || 1} were declined.`
        );
        setNotice({ text: "Offer has been declined.", type: "info" });
      }
    } finally {
      setIsDeclining(false);
    }
  };

  // Stepper state calculation
  // 1. Request sent (always complete)
  // 2. In negotiation (active if no booking)
  // 3. Final terms (complete if both approved / active if proposal exists)
  // 4. Confirmed (complete if booking exists)
  const isConfirmed = Boolean(booking);
  const isFinalTermsAgreed = Boolean(proposal?.providerApprovedAt && proposal?.receiverApprovedAt);
  const hasActiveProposal = Boolean(proposal);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageMeta
        title={`Negotiation · ${materialTypeLabel(material.type)} | GreenLoop`}
        description={t("negotiation.subtitle")}
      />

      {/* Top Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          to={isProvider ? "/app/market-demand" : "/app/receiver/demand"}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-steel-500 hover:text-loop-700 dark:text-gray-400 dark:hover:text-loop-300"
        >
          <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t("negotiation.back")}
        </Link>
      </nav>

      {/* Header Banner Card (Exact Reference Design) */}
      <header className="rounded-2xl border border-steel-200 bg-white p-4 sm:p-5 shadow-xs dark:border-steel-800 dark:bg-[#122319]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Left: Material Photo & Meta Info */}
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={materialImage}
              alt={material.name || materialTypeLabel(material.type)}
              className="size-16 sm:size-20 rounded-2xl object-cover border border-steel-100 dark:border-steel-800 shrink-0 shadow-2xs"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-archivo text-xl sm:text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
                  {material.name || materialTypeLabel(material.type)}
                </h1>
                {material.verificationStatus === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-600" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    <span className="size-1.5 rounded-full bg-amber-600" />
                    Unverified
                  </span>
                )}
                <span className="rounded-md bg-[#f2f1ec] px-2 py-0.5 text-[11px] font-medium text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                  Grade {material.grade || "A"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-steel-500 dark:text-steel-400">
                <span className="inline-flex items-center gap-1 font-medium">
                  <svg className="size-3.5 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
                    <path d="m3.27 6.96 8.73 4.88 8.73-4.88" />
                    <path d="M12 22.08V12" />
                  </svg>
                  {material.quantityT} tonnes
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <svg className="size-3.5 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {project?.name || "Project 1"} · {project?.location || demand.location}
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <svg className="size-3.5 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                  {material.availableFrom ? `Available ${formatDate(material.availableFrom)}` : "Available now"}
                </span>
              </div>
            </div>
          </div>

          {/* Middle: "Your request" info card */}
          <div className="flex items-center gap-5">
            <div className="rounded-2xl border border-emerald-100 bg-[#f4f9f5] px-4 py-2.5 dark:border-emerald-900/50 dark:bg-[#16271e] min-w-[130px]">
              <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                Your request
              </span>
              <p className="font-archivo text-base sm:text-lg font-bold text-ink-900 dark:text-white">
                {demand.requiredT} tonnes
              </p>
              <p className="text-[10px] text-steel-500 dark:text-steel-400">
                Sent on {formatDate(demand.createdAt)}
              </p>
            </div>

            {/* Right: 4-Step Stepper Progress Bar */}
            <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1">
              {/* Step 1: Request sent */}
              <div className="flex flex-col items-center">
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-2xs">
                  ✓
                </span>
                <span className="mt-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                  Request sent
                </span>
              </div>

              <div className={`h-0.5 w-6 sm:w-10 ${hasActiveProposal || isConfirmed ? "bg-emerald-500" : "bg-emerald-300"}`} />

              {/* Step 2: In negotiation */}
              <div className="flex flex-col items-center">
                <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow-2xs ${
                  isConfirmed || isFinalTermsAgreed
                    ? "bg-emerald-600 text-white"
                    : "border-2 border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                }`}>
                  {isConfirmed || isFinalTermsAgreed ? "✓" : "●"}
                </span>
                <span className={`mt-1 text-[10px] font-semibold whitespace-nowrap ${
                  isConfirmed || isFinalTermsAgreed
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-emerald-700 dark:text-emerald-400 font-bold"
                }`}>
                  In negotiation
                </span>
              </div>

              <div className={`h-0.5 w-6 sm:w-10 ${isConfirmed || isFinalTermsAgreed ? "bg-emerald-500" : "bg-steel-200 dark:bg-steel-700"}`} />

              {/* Step 3: Final terms */}
              <div className="flex flex-col items-center">
                <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow-2xs ${
                  isConfirmed || isFinalTermsAgreed
                    ? "bg-emerald-600 text-white"
                    : hasActiveProposal
                    ? "border-2 border-emerald-600 bg-white text-emerald-800 dark:bg-[#122319] dark:text-emerald-300"
                    : "border border-steel-300 bg-white text-steel-400 dark:border-steel-700 dark:bg-[#122319]"
                }`}>
                  {isConfirmed || isFinalTermsAgreed ? "✓" : "3"}
                </span>
                <span className={`mt-1 text-[10px] font-medium whitespace-nowrap ${
                  isConfirmed || isFinalTermsAgreed ? "text-emerald-800 dark:text-emerald-300 font-bold" : "text-steel-400"
                }`}>
                  Final terms
                </span>
              </div>

              <div className={`h-0.5 w-6 sm:w-10 ${isConfirmed ? "bg-emerald-500" : "bg-steel-200 dark:bg-steel-700"}`} />

              {/* Step 4: Confirmed */}
              <div className="flex flex-col items-center">
                <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow-2xs ${
                  isConfirmed
                    ? "bg-emerald-600 text-white"
                    : "border border-steel-300 bg-white text-steel-400 dark:border-steel-700 dark:bg-[#122319]"
                }`}>
                  {isConfirmed ? "✓" : "4"}
                </span>
                <span className={`mt-1 text-[10px] font-medium whitespace-nowrap ${
                  isConfirmed ? "text-emerald-800 dark:text-emerald-300 font-bold" : "text-steel-400"
                }`}>
                  Confirmed
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Workspace Role Mismatch Recovery Banner */}
      {isWrongWorkspace && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <div className="flex items-center gap-2.5">
            <svg aria-hidden="true" className="size-5 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="font-semibold">
                Viewing in {user?.activeWorkspace} workspace — this deal requires your {expectedRole} workspace.
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Switch workspaces to approve or propose commercial terms for this negotiation.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void setActiveWorkspace(expectedRole)}
            className="shrink-0 bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            Switch to {expectedRole === "provider" ? "Provider" : "Receiver"} Workspace →
          </Button>
        </div>
      )}

      {/* Prominent Order Link Banner when booking exists or terms agreed */}
      {(booking || isFinalTermsAgreed) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/50">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white">✓</span>
            <div>
              <p className="font-archivo text-base font-bold text-emerald-950 dark:text-emerald-100">
                {booking ? `Final Terms Approved — Order #${booking.id} Established` : "Negotiation Completed — Final Terms Agreed"}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Both parties agreed to {proposal?.quantityT ?? booking?.tonnesT ?? 10} t at {formatINRPerT(booking?.agreedPricePerT ?? proposal?.pricePerT ?? 4900)}. Complete payment into secure escrow to lock order.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isProvider && (
              <button
                type="button"
                id="make-payment-escrow-banner-btn"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#164b2d] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#123e25]"
              >
                🔒 Make Payment &amp; Escrow →
              </button>
            )}
            {booking && (
              <Link
                to={`/app/orders/${booking.id}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-700 bg-white px-4 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:bg-[#122319] dark:text-emerald-300 dark:border-emerald-800"
              >
                Order Workspace
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Notifications / Feedback Bar */}
      {notice && (
        <div
          role="status"
          className={cn(
            "mt-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
            notice.type === "success" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
            notice.type === "error" && "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
            notice.type === "info" && "border-loop-300 bg-loop-50 text-loop-900 dark:border-loop-800 dark:bg-loop-950/50 dark:text-loop-100",
          )}
        >
          <div className="flex items-center gap-2">
            <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs Bar (Exact Reference Image) */}
      <nav className="mt-6 flex items-center gap-8 border-b border-steel-200 dark:border-steel-800 text-sm font-semibold overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("conversation")}
          className={`pb-3 transition relative whitespace-nowrap ${
            activeTab === "conversation"
              ? "text-emerald-800 dark:text-emerald-400 font-bold"
              : "text-steel-600 dark:text-steel-400 hover:text-ink-900 dark:hover:text-white"
          }`}
        >
          Conversation
          {activeTab === "conversation" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#164b2d] dark:bg-[#00e599]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("offer_terms")}
          className={`pb-3 transition relative whitespace-nowrap ${
            activeTab === "offer_terms"
              ? "text-emerald-800 dark:text-emerald-400 font-bold"
              : "text-steel-600 dark:text-steel-400 hover:text-ink-900 dark:hover:text-white"
          }`}
        >
          Offer &amp; Terms
          {activeTab === "offer_terms" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#164b2d] dark:bg-[#00e599]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("material_details")}
          className={`pb-3 transition relative whitespace-nowrap ${
            activeTab === "material_details"
              ? "text-emerald-800 dark:text-emerald-400 font-bold"
              : "text-steel-600 dark:text-steel-400 hover:text-ink-900 dark:hover:text-white"
          }`}
        >
          Material Details
          {activeTab === "material_details" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#164b2d] dark:bg-[#00e599]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`pb-3 transition relative whitespace-nowrap ${
            activeTab === "documents"
              ? "text-emerald-800 dark:text-emerald-400 font-bold"
              : "text-steel-600 dark:text-steel-400 hover:text-ink-900 dark:hover:text-white"
          }`}
        >
          Documents
          {activeTab === "documents" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#164b2d] dark:bg-[#00e599]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`pb-3 transition relative whitespace-nowrap ${
            activeTab === "activity"
              ? "text-emerald-800 dark:text-emerald-400 font-bold"
              : "text-steel-600 dark:text-steel-400 hover:text-ink-900 dark:hover:text-white"
          }`}
        >
          Activity
          {activeTab === "activity" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#164b2d] dark:bg-[#00e599]" />
          )}
        </button>
      </nav>

      {/* TAB 1: CONVERSATION (Exact Reference Layout) */}
      {activeTab === "conversation" && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Central Chat Area (7 cols on lg, leaving generous room for messages) */}
          <section
            aria-labelledby="chat-heading"
            className="flex flex-col rounded-2xl border border-steel-200 bg-white shadow-xs dark:border-steel-800 dark:bg-[#122319] lg:col-span-8 min-h-[620px]"
          >
            {/* Chat Messages Stream */}
            <div
              ref={chatScrollRef}
              className="flex flex-1 flex-col gap-5 p-4 sm:p-6 overflow-y-auto max-h-[640px]"
            >
              {/* Date Divider Chip */}
              <div className="flex justify-center my-1">
                <span className="rounded-full bg-steel-100 px-3.5 py-1 text-[11px] font-semibold text-steel-500 dark:bg-steel-800 dark:text-steel-400">
                  {formatDate(offer.createdAt || new Date().toISOString())}
                </span>
              </div>

              {conversation.messages.length === 0 && !proposal && (
                <div className="m-auto flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-2">
                    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                    Start Bilateral Conversation
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-steel-500 dark:text-steel-400">
                    Discuss expected pricing, transport logistics, or test requirements before formalizing terms.
                  </p>
                </div>
              )}

              {/* Render Message Stream */}
              {conversation.messages.map((item) => {
                const isMine = item.senderRole === (isProvider ? "provider" : "receiver");
                const initialLetter = item.senderName?.charAt(0)?.toUpperCase() || (item.senderRole === "provider" ? "P" : "R");

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]",
                      isMine ? "self-end flex-row-reverse" : "self-start",
                    )}
                  >
                    {/* User Avatar */}
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-2xs",
                        isMine
                          ? "bg-emerald-700 text-white dark:bg-emerald-600"
                          : "bg-emerald-800 text-white dark:bg-emerald-700",
                      )}
                    >
                      {initialLetter}
                    </div>

                    <div className={cn("flex flex-col", isMine && "items-end")}>
                      {/* Sender Name + Time header */}
                      <div className="flex items-center gap-1.5 text-xs text-steel-500 dark:text-steel-400 mb-1">
                        <span className="font-semibold text-ink-900 dark:text-steel-200">
                          {item.senderName}
                        </span>
                        <span>•</span>
                        <time>{formatDate(item.createdAt)}</time>
                      </div>

                      {/* Message Bubble (Matching Reference Image) */}
                      <div
                        className={cn(
                          "rounded-2xl p-3.5 text-sm leading-relaxed",
                          isMine
                            ? "bg-[#ecf7f0] border border-[#d2ecd8] text-steel-900 dark:bg-[#1a3827] dark:border-[#26533a] dark:text-white rounded-tr-sm shadow-2xs"
                            : "bg-steel-100 text-steel-900 dark:bg-steel-800/80 dark:text-steel-100 rounded-tl-sm",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{item.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Structured Offer Card Embedded in Chat Stream (Exact Reference Image) */}
              {proposal && (
                <div className="flex items-start gap-2.5 max-w-[95%] sm:max-w-[88%] self-start my-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white text-xs font-bold shadow-2xs">
                    {proposal.proposedBy === "provider" ? "P" : "R"}
                  </div>

                  <div className="flex flex-col flex-1">
                    {/* Header with Sender & Time */}
                    <div className="flex items-center gap-1.5 text-xs text-steel-500 dark:text-steel-400 mb-1.5">
                      <span className="font-semibold text-ink-900 dark:text-steel-200">
                        {proposal.proposedBy === "provider" ? (project?.name || "Provider") : (user?.name || "Receiver")}
                      </span>
                      <span>•</span>
                      <time>{formatDate(proposal.createdAt)}</time>
                    </div>

                    {/* Green Bordered Offer Card */}
                    <div className="rounded-2xl border-2 border-emerald-600/50 bg-white p-4 sm:p-5 shadow-sm dark:border-emerald-700/60 dark:bg-[#15271d]">
                      {/* Card Header with Version Badge */}
                      <div className="flex items-center justify-between pb-3 border-b border-steel-100 dark:border-steel-800">
                        <span className="font-bold text-xs text-ink-900 dark:text-white">
                          Formal Commercial Terms
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
                          Formal Offer • Version {proposal.version}
                        </span>
                      </div>

                      {/* 2-Column Details Grid */}
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 text-xs">
                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Material</span>
                          <span className="font-bold text-ink-900 dark:text-white">
                            {materialTypeLabel(material.type)} (Grade {material.grade || "A"})
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Delivery Charges</span>
                          <span className="font-bold text-ink-900 dark:text-white">
                            ₹{estimatedDeliveryFee.toLocaleString("en-IN")} (within 25 km)
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Quantity</span>
                          <span className="font-bold text-ink-900 dark:text-white">
                            {proposal.quantityT} tonnes
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Estimated Delivery</span>
                          <span className="font-bold text-ink-900 dark:text-white">
                            {proposal.slotId === "unscheduled" ? "Within 5 days" : slot ? formatDate(slot.date) : /^\d{4}-\d{2}-\d{2}$/.test(proposal.slotId) ? formatDate(proposal.slotId) : "Within 5 days"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Unit Price</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 font-archivo">
                            ₹{proposal.pricePerT.toLocaleString("en-IN")} / tonne
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Payment Terms</span>
                          <span className="font-bold text-ink-900 dark:text-white">
                            50% advance, 50% on delivery
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Total Material Value</span>
                          <span className="font-bold text-ink-900 dark:text-white font-archivo">
                            ₹{(proposal.quantityT * proposal.pricePerT).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-0.5">
                          <span className="text-steel-500 dark:text-steel-400 font-medium">Validity</span>
                          <span className="font-bold text-ink-900 dark:text-white">7 days</span>
                        </div>
                      </div>

                      {/* Action Buttons Row on the Offer Card */}
                      <div className="mt-5 pt-3.5 border-t border-steel-100 dark:border-steel-800">
                        {isConfirmed || isFinalTermsAgreed ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <span>✓ Terms Agreed &amp; Finalized {booking ? `(Order #${booking.id})` : "(Ready for Escrow Deposit)"}</span>
                            {!isProvider && (
                              <button
                                type="button"
                                id="pay-secure-order-card-btn"
                                onClick={() => setShowPaymentModal(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#164b2d] px-4 py-2 text-xs font-bold text-white hover:bg-[#123e25] shadow-xs transition"
                              >
                                🔒 Pay &amp; Secure Order →
                              </button>
                            )}
                          </div>
                        ) : awaitingMe && !approvedByMe && offer.status === "pending" ? (
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              id="accept-offer-card-btn"
                              disabled={isApproving}
                              onClick={approve}
                              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#164b2d] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#22633e] disabled:opacity-50 dark:bg-[#1e5836]"
                            >
                              <span>{isApproving ? "Accepting…" : "✓ Accept Offer"}</span>
                            </button>

                            <button
                              type="button"
                              id="counter-offer-card-btn"
                              onClick={() => openCreateOrCounterModal("counter")}
                              className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-xl border border-steel-300 bg-white px-5 py-2.5 text-xs font-semibold text-steel-800 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#1a2b21] dark:text-steel-200"
                            >
                              Counter Offer
                            </button>

                            <button
                              type="button"
                              id="decline-offer-card-btn"
                              disabled={isDeclining}
                              onClick={handleDecline}
                              className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-xl border border-steel-300 bg-white px-5 py-2.5 text-xs font-semibold text-steel-700 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#1a2b21] dark:text-steel-300"
                            >
                              {isDeclining ? "Declining…" : "Decline"}
                            </button>
                          </div>
                        ) : approvedByMe && !isFinalTermsAgreed ? (
                          <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                            <span>⏳ You approved Version {proposal.version}. Waiting for counterparty approval.</span>
                            {canPropose && (
                              <button
                                type="button"
                                onClick={() => openCreateOrCounterModal("counter")}
                                className="font-semibold underline hover:text-emerald-950"
                              >
                                Revise Offer
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-steel-500">
                            <span>Status: {proposal.status.replace(/_/g, " ")}</span>
                            {canPropose && (
                              <button
                                type="button"
                                onClick={() => openCreateOrCounterModal("counter")}
                                className="font-semibold text-emerald-800 dark:text-emerald-300 hover:underline"
                              >
                                Propose Counter Offer →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fixed Composer Bottom Bar (Exact Reference Image) */}
            <div className="border-t border-steel-100 p-3 sm:p-4 dark:border-steel-800 bg-steel-50/40 dark:bg-[#0f1d14] rounded-b-2xl">
              {offer.status === "pending" ? (
                <div className="space-y-2.5">
                  {/* Action Toolbar above composer: + Create Offer button */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      id="create-formal-offer-btn"
                      onClick={() => openCreateOrCounterModal(proposal ? "counter" : "create")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>{proposal ? "Propose Counter-Offer" : "Create Formal Offer"}</span>
                    </button>

                    <span className="text-[11px] text-steel-400">
                      Messages do not bind terms until formal offer is accepted
                    </span>
                  </div>

                  {/* Fixed Chat Input Row */}
                  <form onSubmit={submitMessage} className="flex items-center gap-2">
                    {/* Attachment Icon Button */}
                    <button
                      type="button"
                      title="Attach documents or terms notes"
                      onClick={() => {
                        setMessage((prev) => (prev ? `${prev}\n[Attached: Standard intake delivery stipulations]` : "[Attached: Standard intake delivery stipulations]"));
                      }}
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-steel-200 bg-white text-steel-500 hover:bg-steel-50 hover:text-steel-700 dark:border-steel-700 dark:bg-[#16271e] dark:text-steel-300 transition"
                    >
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>

                    {/* Text input */}
                    <input
                      type="text"
                      id="negotiation-message-input"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="h-11 flex-1 rounded-xl border border-steel-200 bg-white px-4 text-sm text-ink-900 placeholder:text-steel-400 focus:border-[#164b2d] focus:outline-none dark:border-steel-700 dark:bg-[#122319] dark:text-white"
                    />

                    {/* + Create Offer button directly beside composer */}
                    <button
                      type="button"
                      id="create-offer-composer-btn"
                      onClick={() => openCreateOrCounterModal(proposal ? "counter" : "create")}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-600/40 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 transition shadow-2xs"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>{proposal ? "+ Propose Final Terms" : "+ Create Offer"}</span>
                    </button>

                    {/* Send Button */}
                    <button
                      type="submit"
                      id="send-chat-message-btn"
                      disabled={!message.trim() || isSubmittingMessage}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#164b2d] text-white shadow-xs hover:bg-[#22633e] disabled:opacity-40 transition dark:bg-[#1e5836]"
                    >
                      <svg className="size-5 translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-center text-xs text-steel-500 py-1">
                  This negotiation is finalized. Messaging is closed.
                </p>
              )}
            </div>
          </section>

          {/* Right Column: Collapsible Accordion Panels (Exact Reference Design) */}
          <aside className="lg:col-span-4 space-y-3">
            {/* 1. Current Offer Accordion */}
            <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <button
                type="button"
                onClick={() => toggleAccordion("currentOffer")}
                className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <span>Current Offer</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    ● {isConfirmed ? "Confirmed" : awaitingMe ? "Awaiting your response" : "Awaiting counterparty"}
                  </span>
                </div>
                <svg className={`size-4 text-steel-400 transition-transform ${openAccordions.currentOffer ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openAccordions.currentOffer && (
                <div className="border-t border-steel-100 p-4 dark:border-steel-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Material</span>
                    <span className="font-semibold text-ink-900 dark:text-white">{materialTypeLabel(material.type)} (Grade {material.grade || "A"})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Quantity</span>
                    <span className="font-semibold text-ink-900 dark:text-white">{currentQuantity} tonnes</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Unit Price</span>
                    <span className="font-semibold text-ink-900 dark:text-white">₹{currentPrice.toLocaleString("en-IN")} / tonne</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Total Material Value</span>
                    <span className="font-semibold text-ink-900 dark:text-white">₹{(currentQuantity * currentPrice).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-steel-100 dark:border-steel-800">
                    <span className="text-steel-500 dark:text-steel-400">Delivery Charges</span>
                    <span className="font-semibold text-ink-900 dark:text-white">₹{estimatedDeliveryFee.toLocaleString("en-IN")} (within 25 km)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Estimated Delivery</span>
                    <span className="font-semibold text-ink-900 dark:text-white">Within 5 days</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Payment Terms</span>
                    <span className="font-semibold text-ink-900 dark:text-white">50% advance, 50% on delivery</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Validity</span>
                    <span className="font-semibold text-ink-900 dark:text-white">7 days</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Estimated Landed Cost Accordion */}
            <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <button
                type="button"
                onClick={() => toggleAccordion("landedCost")}
                className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
              >
                <span>Estimated Landed Cost</span>
                <svg className={`size-4 text-steel-400 transition-transform ${openAccordions.landedCost ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openAccordions.landedCost && (
                <div className="border-t border-steel-100 p-4 dark:border-steel-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Material Cost</span>
                    <span className="font-semibold text-ink-900 dark:text-white font-archivo">
                      ₹{(currentQuantity * currentPrice).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-steel-500 dark:text-steel-400">Delivery Charges</span>
                    <span className="font-semibold text-ink-900 dark:text-white font-archivo">
                      ₹{estimatedDeliveryFee.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-steel-100 dark:border-steel-800">
                    <span className="font-bold text-sm text-ink-900 dark:text-white">Estimated Total</span>
                    <span className="font-archivo text-base font-bold text-emerald-700 dark:text-emerald-400">
                      ₹{((currentQuantity * currentPrice) + estimatedDeliveryFee).toLocaleString("en-IN")}
                    </span>
                  </div>

                  <p className="pt-1 text-[11px] text-steel-500 dark:text-steel-400 flex items-center gap-1">
                    <span>ⓘ</span>
                    <span>Final amount will be confirmed in agreed terms.</span>
                  </p>
                </div>
              )}
            </div>

            {/* 3. Material Specifications Accordion */}
            <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <button
                type="button"
                onClick={() => toggleAccordion("materialSpecs")}
                className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
              >
                <span>Material Specifications</span>
                <svg className={`size-4 text-steel-400 transition-transform ${openAccordions.materialSpecs ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openAccordions.materialSpecs && (
                <div className="border-t border-steel-100 p-4 dark:border-steel-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-steel-500">Condition:</span>
                    <span className="font-semibold capitalize text-ink-900 dark:text-white">{material.condition}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-steel-500">Grade:</span>
                    <span className="font-semibold text-ink-900 dark:text-white">Grade {material.grade || "A"}</span>
                  </div>
                  {material.dimensions && (
                    <div className="flex justify-between">
                      <span className="text-steel-500">Dimensions:</span>
                      <span className="font-semibold text-ink-900 dark:text-white">{material.dimensions}</span>
                    </div>
                  )}
                  {material.provenance?.structureType && (
                    <div className="flex justify-between">
                      <span className="text-steel-500">Provenance:</span>
                      <span className="font-semibold text-ink-900 dark:text-white">{material.provenance.structureType}</span>
                    </div>
                  )}
                  {material.surveyNotes && (
                    <div className="pt-1 border-t border-steel-100 dark:border-steel-800">
                      <p className="text-[11px] text-steel-600 dark:text-steel-400 italic">"{material.surveyNotes}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. Verification Evidence Accordion */}
            <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <button
                type="button"
                onClick={() => toggleAccordion("evidence")}
                className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
              >
                <span>Verification Evidence</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-steel-100 px-2 py-0.5 text-[10px] font-semibold text-steel-600 dark:bg-steel-800 dark:text-steel-300">
                    {material.evidence?.length || 3} documents
                  </span>
                  <svg className={`size-4 text-steel-400 transition-transform ${openAccordions.evidence ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {openAccordions.evidence && (
                <div className="border-t border-steel-100 p-4 dark:border-steel-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-steel-50 dark:bg-steel-800/40">
                    <div className="flex items-center gap-2">
                      <span>📄</span>
                      <span className="font-medium text-ink-900 dark:text-white">NABL Lab Structural Test Report</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">Passed</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-steel-50 dark:bg-steel-800/40">
                    <div className="flex items-center gap-2">
                      <span>📋</span>
                      <span className="font-medium text-ink-900 dark:text-white">Material Passport Survey Log</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">Verified</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-steel-50 dark:bg-steel-800/40">
                    <div className="flex items-center gap-2">
                      <span>⚖️</span>
                      <span className="font-medium text-ink-900 dark:text-white">Tare Weighbridge Ticket</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">Verified</span>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Provider / Counterparty Information Accordion */}
            <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <button
                type="button"
                onClick={() => toggleAccordion("partyInfo")}
                className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
              >
                <span>{isProvider ? "Receiver Information" : "Provider Information"}</span>
                <svg className={`size-4 text-steel-400 transition-transform ${openAccordions.partyInfo ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openAccordions.partyInfo && (
                <div className="border-t border-steel-100 p-4 dark:border-steel-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-steel-500">Organization:</span>
                    <span className="font-semibold text-ink-900 dark:text-white">{project?.name || "ABC Construction"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-steel-500">Site Location:</span>
                    <span className="font-semibold text-ink-900 dark:text-white">{project?.location || demand.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-steel-500">KYC &amp; Verification:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">● GreenLoop Certified</span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* TAB 2: OFFER & TERMS (Deep Dive & Landed Cost Breakdown) */}
      {activeTab === "offer_terms" && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Dual Bilateral Approval Card */}
            <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white mb-1">
                Bilateral Approval Verification (Both Required)
              </h3>
              <p className="text-xs text-steel-500 mb-4">
                Both parties must formally approve the same offer version before final order confirmation.
              </p>

              <div className="space-y-3">
                <div className={`flex items-center gap-3 rounded-xl border p-3 ${
                  proposal?.providerApprovedAt
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40"
                    : "border-steel-200 bg-steel-50/50 dark:border-steel-700 dark:bg-steel-800/40"
                }`}>
                  <span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                    proposal?.providerApprovedAt ? "bg-emerald-600 text-white" : "bg-steel-200 text-steel-600 dark:bg-steel-700 dark:text-steel-300"
                  }`}>
                    {proposal?.providerApprovedAt ? "✓" : "⏳"}
                  </span>
                  <div>
                    <p className="font-bold text-xs text-ink-900 dark:text-white">Provider Approval</p>
                    <p className="text-[11px] text-steel-500">
                      {proposal?.providerApprovedAt ? `Approved on ${formatDate(proposal.providerApprovedAt)}` : "Awaiting provider approval"}
                    </p>
                  </div>
                </div>

                <div className={`flex items-center gap-3 rounded-xl border p-3 ${
                  proposal?.receiverApprovedAt
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40"
                    : "border-steel-200 bg-steel-50/50 dark:border-steel-700 dark:bg-steel-800/40"
                }`}>
                  <span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                    proposal?.receiverApprovedAt ? "bg-emerald-600 text-white" : "bg-steel-200 text-steel-600 dark:bg-steel-700 dark:text-steel-300"
                  }`}>
                    {proposal?.receiverApprovedAt ? "✓" : "⏳"}
                  </span>
                  <div>
                    <p className="font-bold text-xs text-ink-900 dark:text-white">Receiver Approval</p>
                    <p className="text-[11px] text-steel-500">
                      {proposal?.receiverApprovedAt ? `Approved on ${formatDate(proposal.receiverApprovedAt)}` : "Awaiting receiver approval"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {awaitingMe && !approvedByMe && offer.status === "pending" && (
                <div className="mt-5 pt-4 border-t border-steel-100 dark:border-steel-800 flex gap-2">
                  <Button size="md" disabled={isApproving} onClick={approve} className="flex-1">
                    {isApproving ? "Accepting…" : "Accept Current Terms"}
                  </Button>
                  <Button size="md" variant="outline" onClick={() => openCreateOrCounterModal("counter")}>
                    Counter Offer
                  </Button>
                </div>
              )}
            </div>

            {/* Right: Landed Cost Card */}
            <div>
              <LandedCostCard
                calculation={activeLandedCalc}
                title={`Commercial Terms Landed Cost & Virgin Benchmark · Version ${proposal?.version || 1}`}
              />
            </div>
          </div>

          {/* Version History Table */}
          {conversation.proposals.length > 0 && (
            <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#122319]">
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white mb-1">
                Terms Version Audit History
              </h3>
              <p className="text-xs text-steel-500 mb-4">
                Complete audit trail of all negotiated term proposals for this agreement.
              </p>

              <div className="space-y-2.5">
                {[...conversation.proposals].reverse().map((p) => {
                  const isCurrent = p.id === proposal?.id;
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-wrap items-center justify-between p-3.5 rounded-xl border text-xs ${
                        isCurrent
                          ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
                          : "border-steel-100 bg-steel-50/50 dark:border-steel-800 dark:bg-[#14231b]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-ink-900 dark:text-white">Version {p.version}</span>
                        <span className="rounded-md bg-steel-100 px-2 py-0.5 text-[10px] font-semibold text-steel-700 capitalize dark:bg-steel-800 dark:text-steel-300">
                          Proposed by {p.proposedBy}
                        </span>
                        {isCurrent && (
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Current Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono"><strong>{p.quantityT} t</strong> @ ₹{p.pricePerT.toLocaleString("en-IN")}/t</span>
                        <span className="font-bold text-ink-900 dark:text-white">₹{(p.quantityT * p.pricePerT).toLocaleString("en-IN")}</span>
                        <span className="text-steel-400">{formatDate(p.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MATERIAL DETAILS */}
      {activeTab === "material_details" && (
        <div className="mt-6 rounded-2xl border border-steel-200 bg-white p-6 shadow-xs dark:border-steel-800 dark:bg-[#122319] space-y-4">
          <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
            Material Passport Specifications
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl bg-steel-50 p-4 dark:bg-steel-800/40 space-y-2">
              <p><strong>Passport ID:</strong> {material.id}</p>
              <p><strong>Material Type:</strong> {materialTypeLabel(material.type)}</p>
              <p><strong>Total Lot Quantity:</strong> {material.quantityT} tonnes</p>
              <p><strong>Condition:</strong> <span className="capitalize">{material.condition}</span></p>
              <p><strong>Quality Grade:</strong> Grade {material.grade || "A"}</p>
              <p><strong>Listed Ex-Works Price:</strong> {material.pricePerT && material.pricePerT > 0 ? formatINRPerT(material.pricePerT) : "Price on request"}</p>
            </div>
            <div className="rounded-xl bg-steel-50 p-4 dark:bg-steel-800/40 space-y-2">
              <p><strong>Origin Project:</strong> {project?.name || "Demolition Site"}</p>
              <p><strong>Project Location:</strong> {project?.location || demand.location}</p>
              <p><strong>Available From:</strong> {material.availableFrom ? formatDate(material.availableFrom) : "Ready now"}</p>
              <p><strong>Survey Date:</strong> {formatDate(material.surveyedAt)}</p>
              <p><strong>Handling Instructions:</strong> {material.provenance?.handlingInstructions || "Standard bulk transport"}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DOCUMENTS */}
      {activeTab === "documents" && (
        <div className="mt-6 rounded-2xl border border-steel-200 bg-white p-6 shadow-xs dark:border-steel-800 dark:bg-[#122319] space-y-4">
          <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
            Verification &amp; Quality Documents
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-steel-200 p-4 dark:border-steel-800">
              <span className="text-2xl">📄</span>
              <h4 className="mt-2 font-bold text-sm text-ink-900 dark:text-white">NABL Lab Structural Test Report</h4>
              <p className="mt-1 text-xs text-steel-500">ISO 17025 accredited compressive strength certificate.</p>
              <span className="mt-3 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Verified</span>
            </div>
            <div className="rounded-xl border border-steel-200 p-4 dark:border-steel-800">
              <span className="text-2xl">📋</span>
              <h4 className="mt-2 font-bold text-sm text-ink-900 dark:text-white">Material Passport Survey Sheet</h4>
              <p className="mt-1 text-xs text-steel-500">Pre-demolition audit sheet and physical grading logs.</p>
              <span className="mt-3 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Verified</span>
            </div>
            <div className="rounded-xl border border-steel-200 p-4 dark:border-steel-800">
              <span className="text-2xl">⚖️</span>
              <h4 className="mt-2 font-bold text-sm text-ink-900 dark:text-white">Tare Weighbridge Ticket</h4>
              <p className="mt-1 text-xs text-steel-500">Certified weigh scale ticket from dispatch yard.</p>
              <span className="mt-3 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Verified</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVITY */}
      {activeTab === "activity" && (
        <div className="mt-6 rounded-2xl border border-steel-200 bg-white p-6 shadow-xs dark:border-steel-800 dark:bg-[#122319] space-y-4">
          <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
            Chronological Audit Activity Log
          </h3>
          <div className="space-y-3 text-xs">
            {dataset.events
              .filter((e) => e.subjectIds?.includes(offer.id) || e.subjectIds?.includes(demand.id))
              .map((e, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-steel-50 dark:bg-steel-800/40">
                  <div className="flex items-center gap-2.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="font-medium text-ink-900 dark:text-white">{e.summary}</span>
                  </div>
                  <span className="text-steel-400">{formatDate(e.at)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modal: Create Formal Offer / Propose Counter-Terms */}
      {showOfferModal && (
        <Modal
          isOpen={showOfferModal}
          onClose={() => setShowOfferModal(false)}
          className="max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-3 border-b border-steel-100 dark:border-steel-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {offerModalMode === "counter" ? "Counter-Proposal" : "Formal Offer"}
                </span>
                <span className="text-[11px] font-mono text-steel-400">
                  Version {conversation.proposals.length + 1}
                </span>
              </div>
              <h3 className="mt-1 font-archivo text-lg font-bold text-ink-900 dark:text-white">
                {offerModalMode === "counter" ? "Propose Counter-Offer" : "Create Formal Commercial Offer"}
              </h3>
              <p className="text-xs text-steel-500">
                Submit agreed price, quantity, delivery fee, and payment terms for mutual acceptance.
              </p>
            </div>
          </div>

          <form onSubmit={handleFormalOfferSubmit} className="mt-4 space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Unit Price (₹ / tonne)
                </label>
                <input
                  type="number"
                  min="1"
                  step="50"
                  required
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Quantity (tonnes)
                </label>
                <input
                  type="number"
                  min="0.1"
                  max={maxAvailableQuantityT}
                  step="0.1"
                  required
                  value={offerQuantity}
                  onChange={(e) => setOfferQuantity(Number(e.target.value))}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                />
                <span className="text-[10px] text-steel-400 mt-1 block">Max available: {maxAvailableQuantityT.toFixed(1)} t</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Delivery Charges (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={offerDeliveryCharges}
                  onChange={(e) => setOfferDeliveryCharges(Number(e.target.value))}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Estimated Delivery / Lead Time
                </label>
                <select
                  value={offerSlotOption}
                  onChange={(e) => setOfferSlotOption(e.target.value)}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="unscheduled">Within 5 days (Flexible holding)</option>
                  <option value="custom">Specific Delivery Date...</option>
                  {compatibleSlots.map((s) => (
                    <option key={s.id} value={s.id}>{formatDate(s.date)} · {s.capacityT} t intake</option>
                  ))}
                </select>
                {offerSlotOption === "custom" && (
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={offerCustomDate || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setOfferCustomDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-steel-300 bg-white px-3 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Payment Terms
                </label>
                <select
                  value={offerPaymentTerms}
                  onChange={(e) => setOfferPaymentTerms(e.target.value)}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="50% advance, 50% on delivery">50% advance, 50% on delivery</option>
                  <option value="100% on gate pass weighment">100% on gate pass weighment</option>
                  <option value="Payment: 30 days net">Payment: 30 days net</option>
                  <option value="10% advance deposit, 90% post NABL test">10% advance deposit, 90% post NABL test</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Taxes (GST)
                </label>
                <select
                  value={offerTaxOption}
                  onChange={(e) => setOfferTaxOption(e.target.value)}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="included">GST Included (18% compliant)</option>
                  <option value="plus18">Add 18% GST to invoice</option>
                  <option value="exempt">GST Exempt (0%)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                  Validity
                </label>
                <select
                  value={offerValidity}
                  onChange={(e) => setOfferValidity(e.target.value)}
                  className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 font-medium text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="7 days">7 days</option>
                  <option value="14 days">14 days</option>
                  <option value="30 days">30 days</option>
                </select>
              </div>
            </div>

            {/* Live Pricing Summary Banner */}
            {(() => {
              const materialCost = offerQuantity * offerPrice;
              const taxCost = offerTaxOption === "plus18" ? Math.round(materialCost * 0.18) : 0;
              const totalCost = materialCost + offerDeliveryCharges + taxCost;
              return (
                <div className="rounded-xl bg-steel-50 p-3.5 dark:bg-steel-800/40 border border-steel-200 dark:border-steel-800">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-steel-500">Material Value ({offerQuantity} t × ₹{offerPrice.toLocaleString("en-IN")}):</span>
                    <span className="font-semibold text-ink-900 dark:text-white">₹{materialCost.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-steel-500">Delivery Charges:</span>
                    <span className="font-semibold text-ink-900 dark:text-white">₹{offerDeliveryCharges.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-steel-500">Taxes (GST):</span>
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {offerTaxOption === "plus18" ? `₹${taxCost.toLocaleString("en-IN")} (18% GST)` : offerTaxOption === "exempt" ? "₹0 (Exempt)" : "Included in agreed unit price"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold border-t border-steel-200 dark:border-steel-700 pt-1.5">
                    <span className="text-ink-900 dark:text-white">Total Agreed Landed Cost:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-archivo">
                      ₹{totalCost.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2 border-t border-steel-100 dark:border-steel-800">
              <button
                type="button"
                onClick={() => setShowOfferModal(false)}
                className="rounded-xl border border-steel-300 px-4 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="submit-formal-offer-btn"
                disabled={isSubmittingOffer}
                className="rounded-xl bg-[#164b2d] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#22633e] disabled:opacity-50 transition"
              >
                {isSubmittingOffer ? "Transmitting…" : "Propose Final Terms"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showPaymentModal && (
        <ReceiverCheckoutModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          booking={booking}
          material={material}
          agreedPricePerT={currentPrice}
          defaultQuantityT={currentQuantity}
        />
      )}
    </main>
  );
}
