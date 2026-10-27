import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import Button from "@/components/ui/button/Button";
import StatusBadge, { type AnyStatus } from "./StatusBadge";
import { materialMediaFor } from "@/config/appMedia";
import {
  parseProcurementPrompt,
  queryContextualProcurement,
  prepareOrderConfirmation,
  type ExtractedRequirements,
  type AssistantCardData,
  type AssistantOrderConfirmation,
  type AssistantMessage,
} from "@shared/domain/procurementAssistant";
import type { Booking, ProviderMaterialListing, MaterialPassport } from "@shared/domain/types";
import { cn, formatDate, formatINR, formatINRPerT, materialTypeLabel } from "@/utils";
import { TruckDelivery } from "@/icons";

function getMaterialName(mat: MaterialPassport | ProviderMaterialListing | undefined): string {
  if (!mat) return "Reclaimed Material";
  if ("name" in mat && mat.name) return mat.name;
  if ("type" in mat && mat.type) return materialTypeLabel(mat.type);
  if ("materialType" in mat && mat.materialType) return materialTypeLabel(mat.materialType);
  return "Reclaimed Material";
}

function getMaterialType(mat: MaterialPassport | ProviderMaterialListing | undefined): string {
  if (!mat) return "concrete";
  if ("type" in mat && mat.type) return mat.type;
  if ("materialType" in mat && mat.materialType) return mat.materialType;
  return "concrete";
}

const SUGGESTED_PROMPTS = [
  "Find Grade A Structural Concrete near Whitefield",
  "Need 30t Reclaimed Steel Beams under ₹45,000/t",
  "Show verified bricks with IS 3495 lab report",
  "Compare landed cost for concrete vs virgin benchmark",
  "Check my active orders and delivery schedule",
  "Need 25t timber for secondary roof framing",
];

interface ProcurementAssistantProps {
  initialMaterialId?: string;
  initialPrompt?: string;
  onNavigateToOrder?: (orderId: string) => void;
  fullScreen?: boolean;
  compact?: boolean;
  onClose?: () => void;
}

export default function ProcurementAssistant({
  initialMaterialId,
  initialPrompt,
  onNavigateToOrder,
  fullScreen = true,
  compact = false,
  onClose,
}: ProcurementAssistantProps) {
  const { dataset, addDemandAction } = useGreenLoopStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userLocation = user?.location || "Whitefield, Bengaluru";

  // Active extracted requirements state
  const [requirements, setRequirements] = useState<ExtractedRequirements>(() => {
    const fromQuery = searchParams.get("q") || initialPrompt || "";
    const fromMatId = searchParams.get("materialId") || initialMaterialId || "";
    const initReq: ExtractedRequirements = {
      location: userLocation,
      specificMaterialId: fromMatId || undefined,
    };
    if (fromQuery) {
      const parsed = parseProcurementPrompt(fromQuery, initReq);
      return parsed.extracted;
    }
    return initReq;
  });

  // Messages list state
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    return [
      {
        id: "msg-welcome",
        sender: "assistant",
        timestamp: new Date().toISOString(),
        text: `**Welcome to GreenLoop Contextual Procurement.**\n\nI connect directly to GreenLoop's live provider inventory, Smart Matching engine, Material Passports, and landed-cost calculations.\n\nDescribe what you need in plain language (e.g. *"Need 50t of Grade A crushed concrete for Whitefield project next week"*) or select one of the suggested inquiries below.`,
        intent: "general_help",
        quickReplies: SUGGESTED_PROMPTS,
      },
    ];
  });

  const [inputPrompt, setInputPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeConfirmation, setActiveConfirmation] = useState<AssistantOrderConfirmation | null>(null);
  const [isPlacingRequest, setIsPlacingRequest] = useState(false);
  const [confirmationDate, setConfirmationDate] = useState<string>("");
  const [confirmationLocation, setConfirmationLocation] = useState<string>(userLocation);
  const [confirmationQuantity, setConfirmationQuantity] = useState<number>(50);
  const [activeComparisonCard, setActiveComparisonCard] = useState<AssistantCardData | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing, activeConfirmation, activeComparisonCard]);

  // Active bookings for order tracking intent
  const userBookings = useMemo(() => {
    return dataset.bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      return true;
    });
  }, [dataset.bookings]);

  /**
   * Helper to resolve receiver destination location.
   */
  const targetReceiverLocation = (req: ExtractedRequirements, defaultLoc: string) => {
    return req.location || defaultLoc;
  };

  /**
   * Process and execute user procurement prompt.
   */
  const handleUserSubmit = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    // 1. Append user message
    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      timestamp: new Date().toISOString(),
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setIsProcessing(true);

    // Short UX delay to give conversational feel
    await new Promise((r) => setTimeout(r, 400));

    try {
      // 2. Parse NLP requirements & intent
      const { intent, extracted } = parseProcurementPrompt(trimmed, requirements);
      setRequirements(extracted);

      let responseText = "";
      let cards: AssistantCardData[] | undefined;
      let orderConfirmation: AssistantOrderConfirmation | undefined;
      let orderBooking: Booking | undefined;
      let quickReplies: string[] = [];

      // 3. Handle by Intent
      if (intent === "create_passport") {
        const matType = extracted.materialType;
        const matLabel = matType ? materialTypeLabel(matType) : "Reclaimed Material";
        const formUrl = matType ? `/app/materials/new?type=${encodeURIComponent(matType)}` : "/app/materials/new";

        responseText = `### Register Material Passport\n\nTo create and issue a verified Material Passport for **${matLabel}**, proceed to the survey registration workflow in your Provider Hub.\n\n**Passport Generation Checklist:**\n1. **Material Classification:** Specify structural category (${matLabel}), estimated tonnage, and physical condition.\n2. **Quality Evidence:** Attach mill test certificates, laboratory reports (IS 383, IS 2062, or IS 3495) or on-site deconstruction documentation.\n3. **Cryptographic Tagging:** Once submitted, GreenLoop generates an authenticated digital passport with an immutable QR code linked to the circular materials ledger.\n\n[Open Material Passport Form →](${formUrl})`;
        quickReplies = ["Open Material Passport Form", "Understand Material Passports", "Browse Live Inventory"];
      } else if (intent === "check_orders") {
        const activeBookings = userBookings.filter((b) => b.status !== "cancelled");
        const orderId = extracted.orderId;
        const matchingBooking = orderId
          ? activeBookings.find((b) => b.id === orderId)
          : null;

        if (matchingBooking) {
          orderBooking = matchingBooking;
          const material = dataset.materials.find((m) => m.id === matchingBooking.materialId)
            || dataset.providerListings?.find((l) => l.materialId === matchingBooking.materialId);
          const matLabel = getMaterialName(material);
          const slot = dataset.slots.find((s) => s.id === matchingBooking.slotId);
          const scheduledDateStr = slot?.date || matchingBooking.createdAt;
          const receiver = dataset.receivers.find((r) => r.id === matchingBooking.receiverId);
          const destinationStr = receiver?.location || userLocation;
          responseText = `### Order Timeline: **${matchingBooking.id}**\n\nFound active order for **${matchingBooking.tonnesT} t** of **${matLabel}**.\n\n- **Status:** \`${matchingBooking.status.toUpperCase()}\`\n- **Scheduled Delivery:** ${formatDate(scheduledDateStr)}\n- **Destination:** ${destinationStr}\n- **Receiver Confirmation:** ${matchingBooking.receiverAcceptedAt ? "Confirmed by Receiver" : "Awaiting Confirmation"}`;
          quickReplies = ["Confirm delivery date", "Reschedule delivery", "View all orders"];
        } else if (activeBookings.length > 0) {
          const list = activeBookings.slice(0, 3).map((b) => {
            const material = dataset.materials.find((m) => m.id === b.materialId)
              || dataset.providerListings?.find((l) => l.materialId === b.materialId);
            const matLabel = getMaterialName(material);
            const slot = dataset.slots.find((s) => s.id === b.slotId);
            const scheduledDateStr = slot?.date || b.createdAt;
            return `• **Order #${b.id}** — **${b.tonnesT} t** of **${matLabel}**\n  - **Status:** \`${b.status.toUpperCase()}\`\n  - **Scheduled Delivery:** ${formatDate(scheduledDateStr)}`;
          }).join("\n\n");
          responseText = `### Active Orders & Delivery Schedule\n\nFound **${activeBookings.length} active order(s)** on file for your workspace:\n\n${list}\n\nYou can track real-time delivery milestones and logistics receipts in the [My Orders](/app/bookings-deliveries) page.`;
          quickReplies = ["View all orders", "Browse Live Inventory", "Compare Landed Costs"];
        } else {
          responseText = `### No Active Orders Found\n\nYou currently have **0 active shipments** or scheduled deliveries on file.\n\n**Recommended Next Actions:**\n• Browse verified reclaimed inventory to request materials for your project site.\n• Or post a material demand so nearby providers can match with your requirements.`;
          quickReplies = ["Browse Live Inventory", "Post a Material Demand", "Create a Passport"];
        }
      } else if (intent === "compare_costs") {
        // Query best matching candidate for landed cost comparison
        const queryResults = queryContextualProcurement(dataset, extracted, userLocation);
        if (queryResults.length > 0) {
          const topCard = queryResults[0];
          setActiveComparisonCard(topCard);
          responseText = `### Landed Cost Breakdown & Virgin Benchmark Comparison\n\nHere is the side-by-side cost analysis for **${getMaterialName(topCard.material)}** against standard virgin benchmarks.\n\n- **Reclaimed Landed Cost:** ${formatINRPerT(topCard.landedCost.reusableLandedCostPerT || 0)}\n- **Virgin Benchmark:** ${formatINRPerT(topCard.savingsVsVirgin?.virginLandedPerT || 1550)} (${topCard.savingsVsVirgin?.virginName || "Virgin Material"})\n- **Estimated Savings:** **${topCard.savingsVsVirgin?.percent || 25}%** (${formatINRPerT(topCard.savingsVsVirgin?.absolutePerT || 380)} savings per tonne)\n\nAll logistics (freight & handling) are calculated dynamically for delivery to **${topCard.landedCost.destination}**.`;
          cards = queryResults.slice(0, 2);
          quickReplies = ["Request this material", "Show more alternatives", "Verify compliance documentation"];
        } else {
          responseText = `No inventory is currently available for that material to calculate landed cost. Please adjust your category or budget preference.`;
          quickReplies = ["Show all available materials", "Crushed concrete", "Structural steel"];
        }
      } else if (intent === "request_material") {
        // Prepare explicit order confirmation card
        const queryResults = queryContextualProcurement(dataset, extracted, userLocation);
        if (queryResults.length > 0) {
          const targetCard = queryResults[0];
          const qty = extracted.quantityT || Math.min(50, "availableT" in targetCard.material ? targetCard.material.availableT : targetCard.material.quantityT);
          const confirmation = prepareOrderConfirmation(
            targetCard,
            qty,
            extracted.location || userLocation,
            extracted.deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
          );
          setActiveConfirmation(confirmation);
          setConfirmationQuantity(confirmation.quantityT);
          setConfirmationDate(confirmation.requestedDate);
          setConfirmationLocation(confirmation.destination);

          responseText = `### Review Requisition Details Before Placement\n\nTo ensure complete procurement safety, please confirm your terms for **${confirmation.materialName}** before we initiate the request:\n\n- **Requested Quantity:** ${confirmation.quantityT} t (of ${confirmation.availableT} t available)\n- **Unit Material Price:** ${formatINRPerT(confirmation.unitPricePerT)}\n- **Total Landed Cost:** ${formatINRPerT(confirmation.totalLandedCostPerT)} (incl. ₹${confirmation.estimatedFreightPerT} freight + ₹${confirmation.estimatedHandlingPerT} handling)\n- **Total Estimated Outlay:** ${formatINR(confirmation.totalEstimatedAmount)}\n- **Destination:** ${confirmation.destination}\n- **Verification Status:** \`${confirmation.verificationStatus.toUpperCase()}\``;
          orderConfirmation = confirmation;
        } else {
          responseText = `I could not locate an available asset matching that request. Would you like to view suitable alternatives?`;
          quickReplies = ["Show available crushed concrete", "Show structural steel"];
        }
      } else {
        // General search & matching
        const queryResults = queryContextualProcurement(dataset, extracted, userLocation);
        cards = queryResults.slice(0, 4);

        if (cards.length > 0) {
          const topCard = cards[0];
          const typeLabel = materialTypeLabel(extracted.materialType || "reclaimed material");
          const eligibleCount = cards.filter((c) => c.candidate.isEligible).length;

          responseText = `### Found ${cards.length} suitable match${cards.length > 1 ? "es" : ""} for ${typeLabel}\n\n`;
          if (eligibleCount > 0) {
            responseText += `I have ranked **${eligibleCount} procurement-ready** asset(s) based on capacity suitability, verification status, and estimated landed cost delivered to **${targetReceiverLocation(extracted, userLocation)}**.\n\n`;
            const scorePct = Math.round(topCard.candidate.score <= 1 ? topCard.candidate.score * 100 : topCard.candidate.score);
            responseText += `The top match is **${getMaterialName(topCard.material)}** with an explainable match score of **${scorePct}%**.`;
          } else {
            responseText += `⚠️ **Notice:** None of the available assets meet 100% of the mandatory criteria (e.g. missing verified test standards or out-of-range quantity). However, I have found close alternatives below with explicit limitations noted.`;
          }

          quickReplies = [
            `Request ${getMaterialName(topCard.material)}`,
            "Compare landed costs with virgin benchmark",
            "Show only certified materials",
          ];
        } else {
          responseText = `### No Exact Material Match Found\n\nI could not find available listings matching **${extracted.materialType || "the requested category"}** with current filters:\n\n- **Category:** ${extracted.materialType || "Any"}\n- **Required Qty:** ${extracted.quantityT ? `${extracted.quantityT} t` : "Any"}\n- **Destination:** ${extracted.location || userLocation}\n\nTry broadening your search or exploring nearby categories below:`;
          quickReplies = [
            "Show all available crushed concrete",
            "Show structural steel inventory",
            "Show reclaimed brick listings",
          ];
        }
      }

      const assistantMsg: AssistantMessage = {
        id: `assist-${Date.now()}`,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        text: responseText,
        intent,
        cards,
        orderConfirmation,
        orderBooking,
        quickReplies,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Please check your network connection and try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `I encountered an unexpected error processing your request: ${errMsg}`,
          quickReplies: ["Retry search", "Show all materials"],
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle initial prompt if supplied
  useEffect(() => {
    if (initialPrompt && messages.length === 1) {
      handleUserSubmit(initialPrompt);
    }
  }, [initialPrompt]);

  /**
   * Confirm and place direct request using backend action.
   */
  const handleConfirmRequisition = async (conf: AssistantOrderConfirmation) => {
    if (isPlacingRequest) return;
    setIsPlacingRequest(true);

    try {
      const demandResult = await addDemandAction({
        receiverId: user?.receiverId,
        materialType: conf.materialType,
        requiredT: confirmationQuantity,
        period: confirmationDate || conf.requestedDate,
        location: confirmationLocation || conf.destination,
        targetMaterialId: conf.materialId,
        notes: `Procured via GreenLoop Conversational Assistant. Agreed price: ${formatINRPerT(conf.unitPricePerT)}. Total landed estimate: ${formatINR(conf.totalLandedCostPerT * confirmationQuantity)}.`,
      });

      if (demandResult && demandResult.id) {
        setActiveConfirmation(null);

        const successMsg: AssistantMessage = {
          id: `success-${Date.now()}`,
          sender: "assistant",
          timestamp: new Date().toISOString(),
          text: `🎉 **Material Request Placed Successfully!**\n\nYour formal requisition for **${confirmationQuantity} t** of **${conf.materialName}** has been registered in GreenLoop with ID: \`${demandResult.id}\`.\n\n- **Target Provider:** ${conf.providerName}\n- **Estimated Total Landed Outlay:** ${formatINR(conf.totalLandedCostPerT * confirmationQuantity)}\n- **Delivery Target:** ${confirmationDate || conf.requestedDate}\n\nThe provider has been notified. You can track mutual term approval or negotiate terms under Requests.`,
          quickReplies: [
            "View request in Demand workspace",
            "Negotiate terms with provider",
            "Procure another material",
          ],
        };
        setMessages((prev) => [...prev, successMsg]);
      } else {
        throw new Error("Unable to create demand record.");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Please check network and try again.";
      alert(`Failed to place requisition: ${errMsg}`);
    } finally {
      setIsPlacingRequest(false);
    }
  };

  /**
   * Quick action button handler.
   */
  const handleCardAction = (
    action: "request" | "compare" | "passport" | "negotiate",
    card: AssistantCardData
  ) => {
    const mat = card.material;
    const matId = "id" in mat ? mat.id : mat.materialId;
    const matName = getMaterialName(mat);

    if (action === "request") {
      const qty = requirements.quantityT || Math.min(50, "availableT" in mat ? mat.availableT : mat.quantityT);
      const conf = prepareOrderConfirmation(
        card,
        qty,
        requirements.location || userLocation,
        requirements.deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      );
      setActiveConfirmation(conf);
      setConfirmationQuantity(conf.quantityT);
      setConfirmationDate(conf.requestedDate);
      setConfirmationLocation(conf.destination);

      handleUserSubmit(`Request ${qty} tonnes of ${matName} (${matId})`);
    } else if (action === "compare") {
      setActiveComparisonCard(card);
      handleUserSubmit(`Compare landed cost for ${matName}`);
    } else if (action === "passport") {
      navigate(`/app/materials/${matId}`);
    } else if (action === "negotiate") {
      // Find or initiate negotiation
      const existingOffer = dataset.offers?.find((o) => o.passportId === matId);
      if (existingOffer) {
        navigate(`/app/negotiations/${existingOffer.id}`);
      } else {
        handleUserSubmit(`I want to negotiate commercial terms for ${matName} (${matId})`);
      }
    }
  };

  /**
   * Reset conversation.
   */
  const handleResetConversation = () => {
    setRequirements({ location: userLocation });
    setActiveConfirmation(null);
    setActiveComparisonCard(null);
    setMessages([
      {
        id: "msg-welcome-reset",
        sender: "assistant",
        timestamp: new Date().toISOString(),
        text: `**Conversation reset.**\n\nHow can I help with your construction procurement today? You can search for structural materials, compare landed cost savings against virgin benchmarks, or track active deliveries.`,
        intent: "general_help",
        quickReplies: SUGGESTED_PROMPTS,
      },
    ]);
  };

  return (
    <div className={cn(
      "flex flex-col bg-[#101913] text-[#f2f3ef]",
      compact
        ? "h-full w-full overflow-hidden"
        : fullScreen
        ? "h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]"
        : "h-[750px] rounded-2xl border border-white/10 shadow-2xl"
    )}>
      {/* Top Header Bar */}
      <div className={cn(
        "flex shrink-0 items-center justify-between border-b border-white/10 bg-[#17251d]/95",
        compact ? "px-3.5 py-2.5" : "px-4 py-3 sm:px-6"
      )}>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className={cn(
            "relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#B7F34A]/30 to-[#1b382b] border border-[#B7F34A]/40 text-[#B7F34A] shadow-[0_0_15px_rgba(183,243,74,0.15)]",
            compact ? "size-8 text-xs" : "size-10 text-base"
          )}>
            <span className="font-mono font-bold">GL</span>
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-[#B7F34A] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className={cn("font-archivo font-bold text-white", compact ? "text-sm" : "text-base sm:text-lg")}>
                Procurement Copilot
              </h2>
              <span className="rounded-full bg-[#B7F34A]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#B7F34A] border border-[#B7F34A]/30">
                Live
              </span>
            </div>
            {!compact && (
              <p className="text-xs text-white/60">
                Conversational matching, landed cost intelligence & safe order execution
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetConversation}
            className={cn(
              "border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
              compact ? "text-[11px] h-7 px-2" : "text-xs h-8"
            )}
          >
            {compact ? "Reset" : "New Query"}
          </Button>

          {compact && (
            <Link
              to={user?.activeWorkspace === "receiver" ? "/app/receiver/assistant" : "/app/assistant"}
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="Expand to full screen"
              aria-label="Expand to full screen"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </Link>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="Close Copilot"
              aria-label="Close Copilot"
            >
              <span className="text-sm leading-none">✕</span>
            </button>
          )}

          {!compact && (
            <Link
              to="/app/bookings-deliveries"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <TruckDelivery className="size-3.5 text-[#B7F34A]" />
              Orders ({userBookings.length})
            </Link>
          )}
        </div>
      </div>

      {/* Extracted Requirements Context Ribbon */}
      {(requirements.materialType || requirements.quantityT || requirements.location || requirements.requireVerifiedPassport) && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#142018] px-4 py-2 text-xs">
          <span className="font-semibold text-white/60 uppercase tracking-wider text-[10px]">Context:</span>
          {requirements.materialType && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[#B7F34A] font-medium">
              <span>Material: {materialTypeLabel(requirements.materialType)}</span>
              <button
                type="button"
                onClick={() => setRequirements((prev) => ({ ...prev, materialType: undefined }))}
                className="hover:text-white text-xs opacity-70 hover:opacity-100"
                title="Remove material filter"
              >
                ✕
              </button>
            </span>
          )}
          {requirements.quantityT && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-white/90">
              <span>Qty: {requirements.quantityT} t</span>
              <button
                type="button"
                onClick={() => setRequirements((prev) => ({ ...prev, quantityT: undefined }))}
                className="hover:text-white text-xs opacity-70 hover:opacity-100"
                title="Remove quantity filter"
              >
                ✕
              </button>
            </span>
          )}
          {requirements.location && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-white/90">
              <span>Site: {requirements.location}</span>
              <button
                type="button"
                onClick={() => setRequirements((prev) => ({ ...prev, location: undefined }))}
                className="hover:text-white text-xs opacity-70 hover:opacity-100"
                title="Remove location filter"
              >
                ✕
              </button>
            </span>
          )}
          {requirements.grade && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-white/90">
              <span>Grade {requirements.grade}</span>
              <button
                type="button"
                onClick={() => setRequirements((prev) => ({ ...prev, grade: undefined }))}
                className="hover:text-white text-xs opacity-70 hover:opacity-100"
                title="Remove grade filter"
              >
                ✕
              </button>
            </span>
          )}
          {requirements.requireVerifiedPassport && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#B7F34A]/20 px-2 py-0.5 text-[#B7F34A] font-semibold">
              <span>✓ Verified Only</span>
              <button
                type="button"
                onClick={() => setRequirements((prev) => ({ ...prev, requireVerifiedPassport: undefined }))}
                className="hover:text-white text-xs opacity-70 hover:opacity-100"
                title="Remove verification requirement"
              >
                ✕
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => setRequirements({})}
            className="ml-auto text-[11px] text-white/50 hover:text-white underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col gap-2 max-w-4xl",
              msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            {/* Sender Label & Timestamp */}
            <div className="flex items-center gap-2 text-xs text-white/50 px-1">
              <span>{msg.sender === "user" ? (user?.name || "You") : "GreenLoop Copilot"}</span>
              <span>•</span>
              <span>{formatDate(msg.timestamp)}</span>
            </div>

            {/* Bubble Text */}
            <div
              className={cn(
                "rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-sm",
                msg.sender === "user"
                  ? "bg-[#1b382b] text-white border border-[#B7F34A]/30 rounded-tr-sm max-w-xl"
                  : "bg-[#17251d] text-white/90 border border-white/10 rounded-tl-sm w-full"
              )}
            >
              <div className="prose prose-invert prose-sm max-w-none space-y-2">
                {msg.text.split("\n\n").map((paragraph, idx) => {
                  if (paragraph.startsWith("### ")) {
                    return (
                      <h3 key={idx} className="font-archivo text-base font-bold text-white mt-2 mb-1">
                        {paragraph.replace("### ", "")}
                      </h3>
                    );
                  }
                  if (paragraph.startsWith("- ")) {
                    const lines = paragraph.split("\n");
                    return (
                      <ul key={idx} className="list-disc pl-5 space-y-1 text-white/80">
                        {lines.map((line, lineIdx) => (
                          <li key={lineIdx} dangerouslySetInnerHTML={{ __html: line.replace(/^- /, "").replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>').replace(/`(.*?)`/g, '<code class="bg-black/30 px-1 rounded text-[#B7F34A]">$1</code>') }} />
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p
                      key={idx}
                      dangerouslySetInnerHTML={{
                        __html: paragraph
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                          .replace(/`(.*?)`/g, '<code class="bg-black/30 px-1 rounded text-[#B7F34A]">$1</code>'),
                      }}
                    />
                  );
                })}
              </div>

              {/* Render Material Cards if attached */}
              {msg.cards && msg.cards.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
                  {msg.cards.map((card) => {
                    const mat = card.material;
                    const matId = "id" in mat ? mat.id : mat.materialId;
                    const matName = getMaterialName(mat);
                    const matType = getMaterialType(mat);
                    const availableT = "availableT" in mat ? mat.availableT : mat.quantityT;
                    const unitPrice = ("pricePerT" in mat ? mat.pricePerT : undefined) ?? 800;
                    const projectLocation: string =
                      "projectLocation" in mat && typeof mat.projectLocation === "string"
                        ? mat.projectLocation
                        : "location" in mat && typeof mat.location === "string"
                        ? mat.location
                        : "Bengaluru";
                    const media = materialMediaFor(matType);
                    const matchRationale =
                      (card.candidate.advantages && card.candidate.advantages[0]) ||
                      card.candidate.summary ||
                      card.compliance.explanation ||
                      "High capacity suitability for local site intake.";

                    return (
                      <div
                        key={matId}
                        className="flex flex-col rounded-xl border border-white/10 bg-[#121c15] p-4 transition-all hover:border-[#B7F34A]/40 hover:shadow-lg"
                      >
                        {/* Top: Image & Key Metrics */}
                        <div className="flex gap-3">
                          <img
                            src={media.src}
                            alt={matName}
                            className="size-16 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs text-[#B7F34A] font-bold">
                                {matId}
                              </span>
                              <StatusBadge status={card.compliance.verificationStatus} />
                            </div>
                            <h4 className="font-archivo text-sm font-bold text-white truncate mt-0.5">
                              {matName}
                            </h4>
                            <p className="text-xs text-white/60 truncate">
                              {projectLocation} • {card.candidate.distanceKm || 20} km
                            </p>
                          </div>
                        </div>

                        {/* Mid: Specifications & Landed Cost Breakdown */}
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-black/20 p-2 text-xs">
                          <div>
                            <span className="text-white/50 block text-[10px]">Stock Available</span>
                            <span className="font-semibold text-white">{availableT} tonnes</span>
                          </div>
                          <div>
                            <span className="text-white/50 block text-[10px]">Base Material Price</span>
                            <span className="font-semibold text-white">{formatINRPerT(unitPrice)}</span>
                          </div>
                          <div className="col-span-2 pt-1 border-t border-white/5 flex items-center justify-between">
                            <div>
                              <span className="text-white/50 block text-[10px]">Delivered Landed Cost</span>
                              <span className="font-bold text-[#B7F34A]">
                                {formatINRPerT(card.landedCost.reusableLandedCostPerT || unitPrice + 370)}
                              </span>
                            </div>
                            {card.savingsVsVirgin && card.savingsVsVirgin.percent > 0 && (
                              <span className="rounded bg-[#B7F34A]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#B7F34A]">
                                Save {card.savingsVsVirgin.percent}% vs Virgin
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Reasons & Evidence Rationale */}
                        <div className="mt-2.5 text-xs text-white/70 space-y-1">
                          <div className="flex items-start gap-1.5">
                            <span className="text-[#B7F34A] font-bold">✓</span>
                            <span className="line-clamp-2">
                              {matchRationale}
                            </span>
                          </div>
                          {card.compliance.limitations.length > 0 && (
                            <div className="flex items-start gap-1.5 text-amber-300/80 text-[11px]">
                              <span>⚠️</span>
                              <span className="line-clamp-1">{card.compliance.limitations[0]}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleCardAction("request", card)}
                            className="bg-[#B7F34A] text-[#101913] hover:bg-[#a3e239] font-bold text-xs h-8"
                          >
                            Request Material
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCardAction("compare", card)}
                            className="border-white/15 bg-white/5 text-white/80 hover:bg-white/10 text-xs h-8"
                          >
                            Compare Cost
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Render Order Confirmation Summary Card if present */}
              {msg.orderConfirmation && (
                <div className="mt-4 rounded-xl border-2 border-[#B7F34A]/50 bg-[#121c15] p-5 shadow-xl not-prose">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#B7F34A] font-bold">
                        Formal Requisition Proposal
                      </span>
                      <h4 className="font-archivo text-base font-bold text-white">
                        {msg.orderConfirmation.materialName} ({msg.orderConfirmation.materialId})
                      </h4>
                    </div>
                    <StatusBadge status={(msg.orderConfirmation.verificationStatus as AnyStatus) || "unverified"} />
                  </div>

                  {/* Form Inputs for Quantity & Date */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-white/60 block mb-1">Quantity (Tonnes)</label>
                      <input
                        type="number"
                        min="1"
                        max={msg.orderConfirmation.availableT}
                        value={confirmationQuantity}
                        onChange={(e) => setConfirmationQuantity(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-white font-semibold focus:border-[#B7F34A] focus:outline-none"
                      />
                      <span className="text-[10px] text-white/40">Max {msg.orderConfirmation.availableT} t available</span>
                    </div>
                    <div>
                      <label className="text-white/60 block mb-1">Target Delivery Date</label>
                      <input
                        type="date"
                        value={confirmationDate || msg.orderConfirmation.requestedDate}
                        onChange={(e) => setConfirmationDate(e.target.value)}
                        className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-white font-semibold focus:border-[#B7F34A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-white/60 block mb-1">Site Destination</label>
                      <input
                        type="text"
                        value={confirmationLocation}
                        onChange={(e) => setConfirmationLocation(e.target.value)}
                        className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-white font-semibold focus:border-[#B7F34A] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Cost Calculation Summary */}
                  <div className="mt-4 rounded-lg bg-black/30 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between text-white/70">
                      <span>Base Material Cost ({confirmationQuantity} t @ {formatINRPerT(msg.orderConfirmation.unitPricePerT)}):</span>
                      <span className="font-semibold text-white">{formatINR(msg.orderConfirmation.unitPricePerT * confirmationQuantity)}</span>
                    </div>
                    <div className="flex justify-between text-white/70">
                      <span>Estimated Freight Transport ({confirmationQuantity} t @ {formatINRPerT(msg.orderConfirmation.estimatedFreightPerT)}):</span>
                      <span className="font-semibold text-white">{formatINR(msg.orderConfirmation.estimatedFreightPerT * confirmationQuantity)}</span>
                    </div>
                    <div className="flex justify-between text-white/70">
                      <span>Offloading & Site Handling ({confirmationQuantity} t @ {formatINRPerT(msg.orderConfirmation.estimatedHandlingPerT)}):</span>
                      <span className="font-semibold text-white">{formatINR(msg.orderConfirmation.estimatedHandlingPerT * confirmationQuantity)}</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-bold">
                      <span className="text-white">Estimated Landed Total:</span>
                      <span className="text-[#B7F34A] text-base">{formatINR(msg.orderConfirmation.totalLandedCostPerT * confirmationQuantity)}</span>
                    </div>
                  </div>

                  {/* Confirmation Buttons */}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => handleConfirmRequisition(msg.orderConfirmation!)}
                      disabled={isPlacingRequest || confirmationQuantity <= 0 || confirmationQuantity > msg.orderConfirmation.availableT}
                      className="bg-[#B7F34A] text-[#101913] hover:bg-[#a3e239] font-bold text-xs h-9 px-4"
                    >
                      {isPlacingRequest ? "Registering Request..." : "Confirm & Place Formal Requisition"}
                    </Button>
                    <Link
                      to={`/app/receiver/demand`}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
                    >
                      Negotiate Custom Commercial Terms
                    </Link>
                  </div>
                </div>
              )}

              {/* Render Order Status Card if requested */}
              {msg.orderBooking && (
                <div className="mt-4 rounded-xl border border-white/15 bg-[#121c15] p-4 not-prose space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs text-[#B7F34A] font-bold">{msg.orderBooking.id}</span>
                      <h4 className="font-archivo text-sm font-bold text-white">
                        Delivery Milestone Tracking
                      </h4>
                    </div>
                    <StatusBadge status={msg.orderBooking.status} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-black/20 p-2.5 rounded-lg">
                    <div>
                      <span className="text-white/50 block text-[10px]">Tonnage</span>
                      <span className="font-semibold text-white">{msg.orderBooking.tonnesT} t</span>
                    </div>
                    <div>
                      <span className="text-white/50 block text-[10px]">Scheduled Date</span>
                      <span className="font-semibold text-white">
                        {formatDate(dataset.slots.find((s) => s.id === msg.orderBooking?.slotId)?.date || msg.orderBooking?.createdAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/50 block text-[10px]">Dispatch Status</span>
                      <span className="font-semibold text-white">{msg.orderBooking?.loadRef ? "Dispatched" : "Pending"}</span>
                    </div>
                    <div>
                      <span className="text-white/50 block text-[10px]">Receiver Verified</span>
                      <span className="font-semibold text-white">{msg.orderBooking?.receiverAcceptedAt ? "Verified" : "Awaiting Delivery"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigateToOrder ? onNavigateToOrder(msg.orderBooking!.id) : navigate(`/app/orders/${msg.orderBooking!.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#B7F34A] px-3 py-1.5 text-xs font-bold text-[#101913] hover:bg-[#a3e239] cursor-pointer"
                    >
                      Open Full Order Workspace →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Reply Chips below assistant messages */}
            {msg.quickReplies && msg.quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 px-1">
                {msg.quickReplies.map((reply, rIdx) => (
                  <button
                    key={rIdx}
                    type="button"
                    onClick={() => handleUserSubmit(reply)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition-colors hover:border-[#B7F34A]/40 hover:bg-[#B7F34A]/10 hover:text-[#B7F34A]"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Typing / Matching Indicator */}
        {isProcessing && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#17251d] px-4 py-3 text-sm text-white/70">
            <span className="size-2 rounded-full bg-[#B7F34A] animate-ping" />
            <span>Scanning live inventory and calculating landed costs...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts Banner */}
      <div className="shrink-0 border-t border-white/10 bg-[#142018] px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto text-xs pb-1">
          <span className="text-white/40 shrink-0 text-[11px] font-semibold">Suggested:</span>
          {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, pIdx) => (
            <button
              key={pIdx}
              type="button"
              onClick={() => handleUserSubmit(prompt)}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:border-[#B7F34A]/40 hover:text-white"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Persistent Message Composer */}
      <div className="shrink-0 border-t border-white/10 bg-[#17251d] p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUserSubmit(inputPrompt);
          }}
          className="relative flex items-center gap-2"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleUserSubmit(inputPrompt);
              }
            }}
            placeholder={compact ? "Ask about materials, specs, orders..." : "Type your procurement requirement (e.g. 'Need 50t Grade A crushed concrete near Whitefield')..."}
            className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-4 py-3 pr-24 text-sm text-white placeholder-white/40 focus:border-[#B7F34A] focus:outline-none focus:ring-1 focus:ring-[#B7F34A]"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <Button
              type="submit"
              disabled={isProcessing || !inputPrompt.trim()}
              size="sm"
              className="bg-[#B7F34A] text-[#101913] hover:bg-[#a3e239] font-bold text-xs h-8 px-3 rounded-lg"
            >
              Send
            </Button>
          </div>
        </form>
        {!compact && (
          <p className="mt-1.5 text-center text-[10px] text-white/40">
            Powered by GreenLoop Smart Matching & Certified Evidence Ledger. Press Enter to send.
          </p>
        )}
      </div>
    </div>
  );
}
