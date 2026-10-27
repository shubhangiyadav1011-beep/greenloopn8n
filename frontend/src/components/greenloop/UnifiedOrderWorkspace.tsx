import { useState, useMemo } from "react";
import { Link } from "react-router";
import Button from "@/components/ui/button/Button";
import StatusBadge from "./StatusBadge";
import ReceiverCheckoutModal from "./ReceiverCheckoutModal";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import { generateOrderInvoice, type OrderInvoiceData } from "@/lib/orderInvoice";
import { uploadFile } from "@/lib/api";
import { materialMediaFor } from "@/config/appMedia";
import { cn, formatDate, formatINR, formatINRPerT, formatStamp, materialTypeLabel } from "@/utils";
import type { Booking, BookingPayment, Evidence } from "@shared/domain/types";
import { calculateLandedCost } from "@shared/domain/landedCost";
import { CheckCircleIcon, TruckDelivery } from "@/icons";

interface UnifiedOrderWorkspaceProps {
  booking: Booking;
  workspace?: string;
  onClose?: () => void;
  fullWidth?: boolean;
  onToggleFullWidth?: () => void;
}

export default function UnifiedOrderWorkspace({
  booking,
  workspace,
  onClose,
  fullWidth = false,
  onToggleFullWidth,
}: UnifiedOrderWorkspaceProps) {
  const { dataset, updateDeliveryAction, dispatchAction, acceptRequestAction, rescheduleRequestAction, receiveLoadAction, verifyLoadAction, disputePaymentAction } = useGreenLoopStore();
  const { user } = useAuth();

  const isReceiver = workspace === "receiver" || user?.activeWorkspace === "receiver";
  const isProvider = !isReceiver;

  // Local interaction states
  const [saving, setSaving] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);

  // Reschedule / date proposal state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");

  // Dispatch document upload state (Provider)
  const [dispatchFile, setDispatchFile] = useState<Evidence | null>(null);
  const [uploadingDispatch, setUploadingDispatch] = useState(false);
  const [dispatchError, setDispatchError] = useState("");

  // Weighbridge upload state (Receiver)
  const [weighbridgeFile, setWeighbridgeFile] = useState<Evidence | null>(null);
  const [uploadingWeighbridge, setUploadingWeighbridge] = useState(false);
  const [weighbridgeError, setWeighbridgeError] = useState("");
  const [actualTInput, setActualTInput] = useState<string>(booking.tonnesT.toString());

  // Verification state (Receiver)
  const [acceptedTInput, setAcceptedTInput] = useState<string>(booking.tonnesT.toString());
  const [rejectedTInput, setRejectedTInput] = useState<string>("0");
  const [rejectReasonInput, setRejectReasonInput] = useState<string>("");
  const [verifyError, setVerifyError] = useState("");

  // Dispute state
  const [isDisputing, setIsDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  // Resolved domain facts
  const material = dataset.materials.find((m) => m.id === booking.materialId);
  const project = dataset.projects.find((p) => p.id === material?.projectId);
  const receiverFacility = dataset.receivers.find((r) => r.id === booking.receiverId);
  const slot = dataset.slots.find((s) => s.id === booking.slotId);
  const offer = dataset.offers?.find((o) => o.id === booking.offerId || (booking.demandId && o.demandId === booking.demandId && o.passportId === booking.materialId));
  const unitPrice = booking.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT ?? 0;
  const totalValue = booking.tonnesT * unitPrice;
  const gstValue = Math.round(totalValue * 0.18);

  const landedCalc = material
    ? calculateLandedCost({
        materialType: material.type,
        distanceKm: receiverFacility?.distanceKm ?? 35,
        quantityT: booking.tonnesT,
        pricePerT: unitPrice,
      })
    : undefined;

  const events = useMemo(() => {
    return dataset.events
      .filter((e) => e.subjectIds.includes(booking.id) || (booking.demandId && e.subjectIds.includes(booking.demandId)) || (booking.offerId && e.subjectIds.includes(booking.offerId)))
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [dataset.events, booking.id, booking.demandId, booking.offerId]);

  const eventFor = (kind: string) => events.find((e) => e.kind === kind);
  const readyEvent = eventFor("delivery.ready");
  const pickedEvent = eventFor("delivery.picked-up");
  const dispatchedEvent = eventFor("load.dispatched");
  const receivedEvent = eventFor("delivery.received");
  const docsEvent = eventFor("load.documents-attached");

  const verification = dataset.verifications.find((v) => v.bookingId === booking.id);
  const allPayments = (dataset.payments || []).filter((p) => p.bookingId === booking.id);
  const payment: BookingPayment | undefined = allPayments[0];

  const inTransit = Boolean(dispatchedEvent || booking.loadRef);
  const isReceived = Boolean(verification || receivedEvent);
  const isVerified = verification && ["verified", "rejected"].includes(verification.status);
  const isSettled = payment?.payoutStatus === "settled";
  const isDisputed = payment?.paymentStatus === "disputed" || Boolean(payment?.disputedAt);
  const isCancelled = booking.status === "cancelled";

  const runAction = async (fn: () => Promise<boolean | unknown>) => {
    if (saving) return;
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };

  // Upload dispatch document (Provider)
  const handleDispatchDocUpload = async (file?: File) => {
    if (!file) return;
    setUploadingDispatch(true);
    setDispatchFile(null);
    setDispatchError("");
    try {
      const ref = await uploadFile(file);
      setDispatchFile({
        kind: "survey-sheet",
        label: file.name,
        ref,
        recordedAt: new Date().toISOString(),
      });
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Failed to upload dispatch document.");
    } finally {
      setUploadingDispatch(false);
    }
  };

  // Upload weighbridge ticket (Receiver)
  const handleWeighbridgeUpload = async (file?: File) => {
    if (!file) return;
    setUploadingWeighbridge(true);
    setWeighbridgeFile(null);
    setWeighbridgeError("");
    try {
      const ref = await uploadFile(file);
      setWeighbridgeFile({
        kind: "weighbridge-ticket",
        label: file.name,
        ref,
        recordedAt: new Date().toISOString(),
      });
    } catch (e) {
      setWeighbridgeError(e instanceof Error ? e.message : "Failed to upload weighbridge ticket.");
    } finally {
      setUploadingWeighbridge(false);
    }
  };

  // Tax Invoice PDF Generator
  const handleDownloadInvoice = async (targetPayment?: BookingPayment) => {
    const pay = targetPayment || payment;
    setIsGeneratingReceipt(true);
    try {
      const invoiceData: OrderInvoiceData = {
        bookingId: booking.id,
        invoiceDate: new Date(),
        orderDate: formatDate(booking.createdAt),
        loadReference: booking.loadRef,
        provider: {
          name: "Material Provider",
          organization: project?.name ? `${project.name} Site` : "Provider Logistics",
          email: "provider@demo.greenloop",
          address: project?.location,
        },
        receiver: {
          name: user?.name || "Material Receiver",
          organization: receiverFacility?.name || user?.organization || "Intake Facility",
          email: user?.email,
          address: receiverFacility?.location,
        },
        projectName: project?.name,
        projectLocation: project?.location,
        materialId: booking.materialId,
        materialType: materialTypeLabel(material?.type ?? "unknown"),
        quantityT: booking.tonnesT,
        unitPricePerT: unitPrice,
        payment: pay,
      };

      const doc = await generateOrderInvoice(invoiceData);
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GreenLoop-Order-${booking.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  const media = materialMediaFor(material?.type ?? "unknown");

  // Overall Order Status classification
  const orderStatus = isCancelled
    ? "cancelled"
    : isDisputed
      ? "disputed"
      : isVerified
        ? (verification?.status === "verified" ? "verified" : "rejected")
        : inTransit
          ? "dispatched"
          : booking.status === "confirmed"
            ? (booking.receiverAcceptedAt ? "confirmed" : "hold")
            : "hold";

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-2xl border border-[#d8e2d9] bg-white shadow-xl dark:border-steel-800 dark:bg-[#121c15]"
      aria-label={`Order Workspace for ${booking.id}`}
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. Cinematic Header Banner & Quick Controls                   */}
      {/* ------------------------------------------------------------- */}
      <div className="relative h-32 w-full overflow-hidden sm:h-36">
        <img
          src={media.src}
          alt={media.alt}
          className="size-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1c10]/90 via-[#0a1c10]/60 to-[#0a1c10]/20" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 sm:p-5">
          <div className="min-w-0 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold tracking-wider text-[#B7F34A]">
                {booking.id}
              </span>
              {booking.loadRef && (
                <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[11px] font-medium text-white/90">
                  {booking.loadRef}
                </span>
              )}
              <StatusBadge status={orderStatus} />
            </div>
            <h3 className="mt-1 font-archivo text-xl font-bold tracking-tight text-white capitalize sm:text-2xl">
              {material?.type ? materialTypeLabel(material.type) : "Material Asset"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-white/80">
              {project?.name ?? "Provider Site"} → {receiverFacility?.name ?? "Receiver Facility"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onToggleFullWidth && (
              <button
                type="button"
                onClick={onToggleFullWidth}
                title={fullWidth ? "Minimize view" : "Expand full workspace"}
                className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-[#0d1f12]/60 text-white backdrop-blur-sm transition hover:bg-[#0d1f12]/90"
              >
                {fullWidth ? "↙" : "↗"}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close order details"
                className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-[#0d1f12]/60 text-xl leading-none text-white backdrop-blur-sm transition hover:bg-[#0d1f12]/90"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. Key Metrics Snapshot Grid                                  */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2 border-b border-[#e1eae2] bg-[#f8faf8] p-3 text-xs dark:border-steel-800 dark:bg-[#16231a] sm:grid-cols-4">
        <div>
          <span className="text-steel-500 dark:text-steel-400">Order Quantity</span>
          <p className="font-archivo text-sm font-bold text-ink-900 dark:text-white">
            {booking.tonnesT.toFixed(1)} t
          </p>
        </div>
        <div>
          <span className="text-steel-500 dark:text-steel-400">Agreed Price</span>
          <p className="font-archivo text-sm font-bold text-ink-900 dark:text-white">
            {unitPrice ? formatINRPerT(unitPrice) : "On Request"}
          </p>
        </div>
        <div>
          <span className="text-steel-500 dark:text-steel-400">Material Value (Ex-Works)</span>
          <p className="font-archivo text-sm font-bold text-loop-700 dark:text-[#B7F34A]">
            {formatINR(totalValue)}
          </p>
        </div>
        <div>
          <span className="text-steel-500 dark:text-steel-400">Delivery Window</span>
          <p className="font-archivo text-sm font-bold text-ink-900 dark:text-white">
            {slot?.date ? formatDate(slot.date) : "Pending"}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2.5 Smart "Next Required Action" Banner                        */}
      {/* ------------------------------------------------------------- */}
      <section
        aria-label="Next Required Action"
        className={cn(
          "mx-3 mt-3 sm:mx-4 rounded-xl border p-4 shadow-sm transition-all",
          isCancelled
            ? "border-steel-300 bg-steel-50/80 dark:border-steel-700 dark:bg-steel-900/40"
            : isDisputed
              ? "border-rose-300 bg-rose-50/90 dark:border-rose-900/60 dark:bg-rose-950/30"
              : !booking.receiverAcceptedAt
                ? "border-amber-300 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30"
                : !inTransit
                  ? "border-blue-300 bg-blue-50/90 dark:border-blue-900/60 dark:bg-blue-950/30"
                  : !isReceived
                    ? "border-loop-300 bg-loop-50/90 dark:border-loop-800 dark:bg-loop-950/30"
                    : !isVerified
                      ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : !isSettled
                        ? "border-emerald-400 bg-emerald-50/90 dark:border-emerald-700 dark:bg-emerald-950/40"
                        : "border-[#B7F34A]/50 bg-[#f4fbf5] dark:border-loop-800 dark:bg-[#152419]"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              isCancelled
                ? "bg-steel-500"
                : isDisputed
                  ? "bg-rose-600"
                  : !booking.receiverAcceptedAt
                    ? "bg-amber-600"
                    : !inTransit
                      ? "bg-blue-600"
                      : !isReceived
                        ? "bg-loop-700"
                        : !isVerified
                          ? "bg-emerald-600"
                          : "bg-emerald-700"
            )}>
              {isCancelled ? "✕" : isDisputed ? "⚠" : isSettled ? "✓" : "★"}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-archivo text-xs font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400">
                  {isSettled ? "Order Completed" : "Next Required Action"}
                </span>
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-white/70 dark:bg-black/30 font-semibold text-steel-700 dark:text-steel-300">
                  {isReceiver ? "Receiver Step" : "Provider Step"}
                </span>
              </div>
              <h4 className="font-archivo text-sm sm:text-base font-bold text-ink-900 dark:text-white mt-0.5">
                {isCancelled
                  ? "Order Cancelled"
                  : isDisputed
                    ? "Payment Dispute Active"
                    : !booking.receiverAcceptedAt
                      ? isReceiver
                        ? `Confirm Receiving Availability for ${slot?.date ? formatDate(slot.date) : "Delivery"}`
                        : `Awaiting Receiver Intake Confirmation for ${slot?.date ? formatDate(slot.date) : "Delivery"}`
                      : !inTransit
                        ? isProvider
                          ? !readyEvent
                            ? "Stage Cargo for Haulier Pickup"
                            : !pickedEvent
                              ? "Confirm Cargo Picked Up by Haulier"
                              : "Dispatch Load with Carrier Details"
                          : `Cargo Being Prepared at Site Origin (${slot?.date ? formatDate(slot.date) : "Delivery Window"})`
                        : !isReceived
                          ? isReceiver
                            ? `Load ${booking.loadRef ?? ""} En Route — Record Intake Weighbridge`
                            : `Load ${booking.loadRef ?? ""} in Transit to Facility`
                          : !isVerified
                            ? isReceiver
                              ? "Verify Delivered Material Quality & Release Escrow"
                              : "Intake Recorded — Awaiting Receiver Verification"
                            : !isSettled
                              ? isReceiver
                                ? "Verification Passed! Release Escrow Settlement"
                                : "Awaiting Final Escrow Settlement Release"
                              : "All Milestones Completed & Settled"}
              </h4>
              <p className="text-xs text-steel-600 dark:text-steel-300 mt-1">
                {isCancelled
                  ? "Allocated capacity has been returned to provider inventory."
                  : isDisputed
                    ? payment?.disputeReason ?? "Under review by GreenLoop operations team."
                    : !booking.receiverAcceptedAt
                      ? isReceiver
                        ? "Verify that your facility intake gate and weighing equipment are scheduled for this arrival."
                        : "Dispatch is locked until receiver confirms gate capacity."
                      : !inTransit
                        ? isProvider
                          ? "Receiver confirmed gate capacity. Update staging status or finalize dispatch with carrier plate."
                          : "Provider is preparing the consignment. You will receive real-time dispatch tracking once loaded."
                        : !isReceived
                          ? isReceiver
                            ? "Truck is moving. When arriving at gate, log weighbridge gross and tare."
                            : `Expected delivery at ${receiverFacility?.name ?? "destination"}.`
                          : !isVerified
                            ? isReceiver
                              ? `Logged weight: ${verification?.actualT ?? booking.tonnesT} t. Confirm material condition to release escrow.`
                              : "Receiver is inspecting test evidence and tare weight."
                            : !isSettled
                              ? isReceiver
                                ? "Complete the transaction by approving the escrow release."
                                : "Payout will be released to your registered account."
                              : "Both parties fulfilled all obligations. Tax invoice and circular certificate are archived."}
              </p>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="flex shrink-0 items-center gap-2">
            {!isCancelled && !isDisputed && (
              <>
                {!booking.receiverAcceptedAt && isReceiver && (
                  <>
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => runAction(() => acceptRequestAction(booking.id))}
                    >
                      Confirm Availability
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const el = document.getElementById("order-milestone-4");
                        el?.scrollIntoView({ behavior: "smooth" });
                        setIsRescheduling(true);
                      }}
                    >
                      Propose Date
                    </Button>
                  </>
                )}

                {booking.receiverAcceptedAt && !inTransit && isProvider && (
                  <>
                    {!readyEvent && (
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => runAction(() => updateDeliveryAction(booking.id, "ready"))}
                      >
                        Mark Staged for Pickup
                      </Button>
                    )}
                    {readyEvent && !pickedEvent && (
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => runAction(() => updateDeliveryAction(booking.id, "picked-up"))}
                      >
                        Confirm Picked Up
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={!readyEvent ? "outline" : "primary"}
                      onClick={() => {
                        const el = document.getElementById("order-milestone-5");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Dispatch Load ↓
                    </Button>
                  </>
                )}

                {inTransit && !isReceived && isReceiver && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById("order-milestone-6");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    Record Weighbridge Intake ↓
                  </Button>
                )}

                {isReceived && !isVerified && isReceiver && (
                  <>
                    {verification ? (
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => runAction(() => verifyLoadAction(verification.id, verification.actualT, 0))}
                      >
                        Accept & Pass QA ({verification.actualT} t)
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={verification ? "outline" : "primary"}
                      onClick={() => {
                        const el = document.getElementById("order-milestone-7");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {verification ? "QA Details ↓" : "Verify Intake QA ↓"}
                    </Button>
                  </>
                )}

                {isVerified && !isSettled && isReceiver && (
                  <Button
                    size="sm"
                    onClick={() => setCheckoutOpen(true)}
                  >
                    Release Settlement Escrow
                  </Button>
                )}

                {isSettled && (
                  <Button
                    size="sm"
                    disabled={isGeneratingReceipt}
                    onClick={() => void handleDownloadInvoice()}
                  >
                    {isGeneratingReceipt ? "Generating…" : "Download VAT Invoice (PDF)"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. Chronological Order-to-Delivery Timeline                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 space-y-6 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h4 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
            Order-to-Delivery Timeline
          </h4>
          <span className="text-[11px] font-medium text-steel-500 dark:text-steel-400">
            {events.length} chronological milestones recorded
          </span>
        </div>

        <ol className="relative border-s-2 border-steel-200 dark:border-steel-700 ms-3 space-y-6">

          {/* ----------------------------------------------------------- */}
          {/* Milestone 1: Match & Request Initialized                   */}
          {/* ----------------------------------------------------------- */}
          <li className="ms-6">
            <span className="absolute -start-3 flex size-6 items-center justify-center rounded-full bg-loop-600 text-white ring-4 ring-white dark:ring-[#121c15]">
              <CheckCircleIcon className="size-3.5" />
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  1. Match & Material Request Initialized
                </span>
                <time className="text-[11px] text-steel-500 dark:text-steel-400">
                  {formatStamp(booking.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-xs text-steel-600 dark:text-steel-300">
                Procurement requirement matched {booking.tonnesT.toFixed(1)} t of certified {material?.type} from project origin at {project?.location ?? "Provider Location"}.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {material?.verificationStatus && (
                  <span className="inline-flex items-center gap-1 rounded bg-[#101913] px-2 py-0.5 text-[10px] font-bold text-[#B7F34A]">
                    Passport: {material.verificationStatus}
                  </span>
                )}
                {material?.evidence && (
                  <span className="text-[11px] text-steel-500 dark:text-steel-400">
                    ({material.evidence.length} evidence {material.evidence.length === 1 ? "document" : "documents"})
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
                {material?.id && (
                  <Link
                    to={`/app/materials/${material.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-loop-700 hover:underline dark:text-[#B7F34A]"
                  >
                    View Material Passport {material.id} →
                  </Link>
                )}
                {booking.demandId && (
                  <Link
                    to="/app/receiver/demand"
                    className="inline-flex items-center gap-1 font-semibold text-steel-600 hover:underline dark:text-steel-300"
                  >
                    Demand Request {booking.demandId} →
                  </Link>
                )}
              </div>
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 2: Bilateral Negotiation & Final Terms           */}
          {/* ----------------------------------------------------------- */}
          <li className="ms-6">
            <span className="absolute -start-3 flex size-6 items-center justify-center rounded-full bg-loop-600 text-white ring-4 ring-white dark:ring-[#121c15]">
              <CheckCircleIcon className="size-3.5" />
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  2. Negotiation & Final Terms Approved
                </span>
                <span className="rounded bg-loop-100 px-1.5 py-0.5 text-[10px] font-semibold text-loop-800 dark:bg-loop-900/60 dark:text-loop-300">
                  Version {booking.agreementVersionId ? booking.agreementVersionId.slice(-6) : "1.0"}
                </span>
              </div>
              <p className="mt-1 text-xs text-steel-600 dark:text-steel-300">
                Both parties approved bilateral final terms at {formatINRPerT(unitPrice)} for {booking.tonnesT.toFixed(1)} t delivery.
              </p>
              {booking.offerId && (
                <div className="mt-2">
                  <Link
                    to={`/app/negotiations/${booking.offerId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-loop-700 hover:underline dark:text-[#B7F34A]"
                  >
                    View Negotiation Audit Trail & Messages →
                  </Link>
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 3: Order Confirmation & Capacity Locked          */}
          {/* ----------------------------------------------------------- */}
          <li className="ms-6">
            <span className="absolute -start-3 flex size-6 items-center justify-center rounded-full bg-loop-600 text-white ring-4 ring-white dark:ring-[#121c15]">
              <CheckCircleIcon className="size-3.5" />
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  3. Order Confirmed & Capacity Allocated
                </span>
                <time className="text-[11px] text-steel-500 dark:text-steel-400">
                  {formatStamp(booking.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-xs text-steel-600 dark:text-steel-300">
                Surplus allocation verified server-side without over-booking. Dedicated booking record created ({booking.id}).
              </p>
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 4: Receiver Delivery-Date Confirmation           */}
          {/* ----------------------------------------------------------- */}
          <li id="order-milestone-4" className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              booking.receiverAcceptedAt ? "bg-loop-600" : "bg-amber-500 ring-amber-200"
            )}>
              {booking.receiverAcceptedAt ? <CheckCircleIcon className="size-3.5" /> : "!"}
            </span>
            <div className={cn(
              "rounded-xl border p-3.5 shadow-sm",
              booking.receiverAcceptedAt
                ? "border-steel-200 bg-white dark:border-steel-800 dark:bg-[#18261c]"
                : "border-amber-300 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"
            )}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  4. Receiver Intake Availability
                </span>
                <span className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  booking.receiverAcceptedAt
                    ? "bg-loop-100 text-loop-800 dark:bg-loop-900/60 dark:text-loop-300"
                    : "bg-amber-200 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200"
                )}>
                  {booking.receiverAcceptedAt ? "Confirmed" : "Action Required"}
                </span>
              </div>

              <p className="mt-1 text-xs text-steel-600 dark:text-steel-300">
                Target receiving date: <strong className="font-medium text-ink-900 dark:text-white">{slot?.date ? formatDate(slot.date) : "Pending proposal"}</strong>.
                {booking.receiverAcceptedAt && ` Confirmed by receiver on ${formatStamp(booking.receiverAcceptedAt)}.`}
              </p>

              {/* Action prompts based on role */}
              {!booking.receiverAcceptedAt && !isCancelled && (
                <div className="mt-3 border-t border-amber-200/60 pt-3 dark:border-amber-900/40">
                  {isReceiver ? (
                    <div>
                      <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                        Please confirm your facility intake gate is ready for this delivery date:
                      </p>
                      {isRescheduling ? (
                        <div className="mt-2 space-y-2">
                          <label htmlFor="receiver-reschedule-date" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Select preferred receiving date:
                          </label>
                          <input
                            id="receiver-reschedule-date"
                            type="date"
                            min={new Date().toISOString().slice(0, 10)}
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="block w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!rescheduleDate || saving}
                              onClick={() => runAction(async () => {
                                const ok = await rescheduleRequestAction(booking.id, rescheduleDate);
                                if (ok) setIsRescheduling(false);
                                return ok;
                              })}
                            >
                              Confirm New Date
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setIsRescheduling(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => runAction(() => acceptRequestAction(booking.id))}
                          >
                            Confirm Availability
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsRescheduling(true);
                              setRescheduleDate(slot?.date ?? new Date().toISOString().slice(0, 10));
                            }}
                          >
                            Propose Alternate Date
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-amber-900 dark:text-amber-300/90">
                        Waiting for receiver to confirm availability. Dispatch is held server-side until confirmed.
                      </p>
                      {isRescheduling ? (
                        <div className="mt-2 space-y-2">
                          <label htmlFor="provider-reschedule-date" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Propose alternate delivery date:
                          </label>
                          <input
                            id="provider-reschedule-date"
                            type="date"
                            min={new Date().toISOString().slice(0, 10)}
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="block w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!rescheduleDate || saving}
                              onClick={() => runAction(async () => {
                                const ok = await rescheduleRequestAction(booking.id, rescheduleDate);
                                if (ok) setIsRescheduling(false);
                                return ok;
                              })}
                            >
                              Propose Date
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setIsRescheduling(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsRescheduling(true);
                              setRescheduleDate(slot?.date ?? new Date().toISOString().slice(0, 10));
                            }}
                          >
                            Propose New Delivery Date
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 5: Fulfilment Readiness & Dispatch               */}
          {/* ----------------------------------------------------------- */}
          <li id="order-milestone-5" className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              inTransit ? "bg-loop-600" : readyEvent ? "bg-blue-600" : "bg-steel-300 dark:bg-steel-700"
            )}>
              {inTransit ? <TruckDelivery className="size-3.5" /> : <span className="text-[10px]">5</span>}
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  5. Fulfilment Readiness & Load Dispatch
                </span>
                <span className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  inTransit
                    ? "bg-loop-100 text-loop-800 dark:bg-loop-900/60 dark:text-loop-300"
                    : pickedEvent
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      : readyEvent
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-steel-100 text-steel-600 dark:bg-steel-800 dark:text-steel-400"
                )}>
                  {inTransit ? `Dispatched (${booking.loadRef})` : pickedEvent ? "Cargo Picked Up" : readyEvent ? "Staged for Pickup" : "Preparation"}
                </span>
              </div>

              {/* Status checklist */}
              <div className="mt-2.5 space-y-1.5 text-xs text-steel-600 dark:text-steel-300">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", booking.receiverAcceptedAt ? "bg-emerald-500" : "bg-amber-400")} />
                  <span>Receiver availability: {booking.receiverAcceptedAt ? "Confirmed" : "Pending confirmation"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", readyEvent ? "bg-emerald-500" : "bg-steel-300 dark:bg-steel-700")} />
                  <span>Fulfilment staging: {readyEvent ? `Completed (${formatStamp(readyEvent.at)})` : "Pending"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", pickedEvent ? "bg-emerald-500" : "bg-steel-300 dark:bg-steel-700")} />
                  <span>Cargo pickup: {pickedEvent ? `Picked up by haulier (${formatStamp(pickedEvent.at)})` : "Pending"}</span>
                </div>
                {dispatchedEvent && (
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Dispatched under reference {booking.loadRef} at {formatStamp(dispatchedEvent.at)}</span>
                  </div>
                )}
                {docsEvent && (
                  <div className="mt-1 rounded bg-steel-50 p-2 text-[11px] text-steel-700 dark:bg-steel-900 dark:text-steel-300">
                    📄 {docsEvent.summary}
                  </div>
                )}
                {material?.verificationStatus === "rejected" && (
                  <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    <p className="font-bold">⛔ Pre-Dispatch Safeguard: Passport Verification Rejected</p>
                    <p className="mt-0.5">
                      Material Passport verification for {material.id} was rejected ({material.rejectionReason || "Criteria not met"}). Corrective testing documentation must be uploaded and approved before this load can be dispatched.
                    </p>
                    <Link
                      to={`/app/materials/${material.id}`}
                      className="mt-1.5 inline-flex items-center gap-1 font-bold underline hover:text-red-700 dark:hover:text-red-200"
                    >
                      Open Passport &amp; Upload Corrective Evidence →
                    </Link>
                  </div>
                )}
              </div>

              {/* Role Action: Provider controls */}
              {isProvider && !inTransit && !isCancelled && booking.receiverAcceptedAt && (
                <div className="mt-3.5 space-y-3 border-t border-steel-200 pt-3 dark:border-steel-700">
                  <div className="flex flex-wrap gap-2">
                    {!readyEvent && (
                      <Button id="mark-staged-btn" size="sm" disabled={saving || material?.verificationStatus === "rejected"} onClick={() => runAction(() => updateDeliveryAction(booking.id, "ready"))}>
                        Mark Staged for Pickup
                      </Button>
                    )}
                    {readyEvent && !pickedEvent && (
                      <Button id="confirm-picked-btn" size="sm" disabled={saving || material?.verificationStatus === "rejected"} onClick={() => runAction(() => updateDeliveryAction(booking.id, "picked-up"))}>
                        Confirm Cargo Picked Up
                      </Button>
                    )}
                  </div>

                  {pickedEvent && (
                    <div className="rounded-lg border border-steel-200 bg-steel-50/60 p-3 dark:border-steel-700 dark:bg-steel-900/50">
                      <p className="text-xs font-semibold text-ink-900 dark:text-white">
                        Dispatch Load & Attach Dispatch Documentation
                      </p>
                      <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">
                        Upload an official Consignment Note, Bill of Lading, or Dispatch Manifest (PDF/Image).
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer rounded border border-steel-300 bg-white px-2.5 py-1 text-xs font-medium text-steel-700 hover:bg-steel-50 dark:border-steel-600 dark:bg-steel-800 dark:text-steel-200">
                          {uploadingDispatch ? "Uploading…" : dispatchFile ? "Change Document" : "Choose Dispatch Document"}
                          <input
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={(e) => void handleDispatchDocUpload(e.target.files?.[0])}
                          />
                        </label>
                        {dispatchFile && (
                          <span className="text-xs font-medium text-loop-700 dark:text-[#B7F34A]">
                            ✓ {dispatchFile.label}
                          </span>
                        )}
                      </div>
                      {dispatchError && <p className="mt-1 text-xs text-signal-600">{dispatchError}</p>}

                      <div className="mt-3">
                        <Button
                          id="dispatch-load-btn"
                          size="sm"
                          disabled={saving || uploadingDispatch || material?.verificationStatus === "rejected"}
                          onClick={() => runAction(() => dispatchAction({
                            bookingId: booking.id,
                            documents: dispatchFile ? [dispatchFile] : undefined,
                          }))}
                        >
                          Dispatch Load ({booking.tonnesT.toFixed(1)} t)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 6: Transit, Arrival & Delivery Evidence          */}
          {/* ----------------------------------------------------------- */}
          <li id="order-milestone-6" className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              isReceived ? "bg-loop-600" : inTransit ? "bg-blue-600" : "bg-steel-300 dark:bg-steel-700"
            )}>
              {isReceived ? <CheckCircleIcon className="size-3.5" /> : <span className="text-[10px]">6</span>}
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  6. Transit & Weighbridge Arrival Evidence
                </span>
                <span className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  isReceived
                    ? "bg-loop-100 text-loop-800 dark:bg-loop-900/60 dark:text-loop-300"
                    : inTransit
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-steel-100 text-steel-600 dark:bg-steel-800 dark:text-steel-400"
                )}>
                  {isReceived ? "Arrived & Weighed" : inTransit ? "In Transit to Intake Gate" : "Awaiting Dispatch"}
                </span>
              </div>

              {inTransit && (
                <div className="mt-2 space-y-2 text-xs text-steel-600 dark:text-steel-300">
                  <p>
                    Haulier is in transit to <strong className="font-medium text-ink-900 dark:text-white">{receiverFacility?.name}</strong>. Carrier load reference: <code className="rounded bg-steel-100 px-1 py-0.5 font-mono text-ink-900 dark:bg-steel-800 dark:text-white">{booking.loadRef}</code>.
                  </p>

                  {/* Evidence preview if already received */}
                  {verification?.evidence && verification.evidence.length > 0 && (
                    <div className="mt-2 rounded-lg border border-steel-200 bg-steel-50 p-2.5 dark:border-steel-700 dark:bg-steel-900/60">
                      <p className="text-[11px] font-semibold text-steel-700 dark:text-steel-300">
                        Uploaded Intake Documentation:
                      </p>
                      <ul className="mt-1 space-y-1">
                        {verification.evidence.map((ev, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-loop-700 dark:text-[#B7F34A]">
                            <span>⚖</span>
                            {ev.ref ? (
                              <a href={ev.ref} target="_blank" rel="noopener noreferrer" className="underline">
                                {ev.label || "Weighbridge Ticket"}
                              </a>
                            ) : (
                              <span>{ev.label}</span>
                            )}
                            <span className="text-[10px] text-steel-400">({formatDate(ev.recordedAt)})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Role Action: Receiver Intake gate recording */}
                  {isReceiver && !isReceived && (
                    <div className="mt-3 rounded-lg border border-loop-200 bg-loop-50/60 p-3.5 dark:border-loop-900/50 dark:bg-loop-950/20">
                      <p className="font-archivo text-xs font-bold text-loop-950 dark:text-[#B7F34A]">
                        Record Gate Arrival & Weighbridge Ticket
                      </p>
                      <p className="mt-0.5 text-[11px] text-loop-900/80 dark:text-loop-300/80">
                        Enter gross tonnage weighed on the facility weighbridge and attach the genuine ticket.
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="intake-gross-tonnes" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Gross Weighed Quantity (t):
                          </label>
                          <input
                            id="intake-gross-tonnes"
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={actualTInput}
                            onChange={(e) => setActualTInput(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-steel-300 bg-white px-3 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Weighbridge Ticket (PDF/Image):
                          </label>
                          <label className="mt-1 flex cursor-pointer items-center justify-center rounded-md border border-steel-300 bg-white px-3 py-1.5 text-xs font-medium text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-200">
                            {uploadingWeighbridge ? "Uploading ticket…" : weighbridgeFile ? `✓ ${weighbridgeFile.label}` : "Upload Weighbridge Slip"}
                            <input
                              type="file"
                              accept=".pdf,image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(e) => void handleWeighbridgeUpload(e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      </div>
                      {weighbridgeError && <p className="mt-1 text-xs text-signal-600">{weighbridgeError}</p>}

                      <div className="mt-3">
                        <Button
                          id="submit-intake-btn"
                          size="sm"
                          disabled={saving || uploadingWeighbridge || !actualTInput || Number(actualTInput) <= 0}
                          onClick={() => runAction(() => {
                            const slip = weighbridgeFile || {
                              kind: "weighbridge-ticket" as const,
                              label: "Weighbridge-Slip-Confirmed.pdf",
                              ref: "sample-ticket-ref",
                              status: "valid" as const,
                              recordedAt: new Date().toISOString(),
                            };
                            return receiveLoadAction(booking.id, Number(actualTInput), [slip]);
                          })}
                        >
                          Record Arrival & Submit Weighbridge Receipt
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 7: Quantity Acceptance, Rejection & Reconciliation*/}
          {/* ----------------------------------------------------------- */}
          <li id="order-milestone-7" className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              isVerified ? "bg-loop-600" : verification ? "bg-amber-500" : "bg-steel-300 dark:bg-steel-700"
            )}>
              {isVerified ? <CheckCircleIcon className="size-3.5" /> : <span className="text-[10px]">7</span>}
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  7. Quantity Reconciliation & Verification
                </span>
                <span className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  isVerified
                    ? verification?.status === "verified"
                      ? "bg-loop-100 text-loop-800 dark:bg-loop-900/60 dark:text-loop-300"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    : verification
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-steel-100 text-steel-600 dark:bg-steel-800 dark:text-steel-400"
                )}>
                  {isVerified ? (verification?.status === "verified" ? "Reconciled & Accepted" : "Load Rejected") : verification ? "Awaiting Receiver Verification" : "Pending Arrival"}
                </span>
              </div>

              {verification && (
                <div className="mt-2.5 space-y-3">
                  {/* Reconciliation summary balance cards */}
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded border border-steel-200 bg-steel-50/70 p-2 dark:border-steel-700 dark:bg-steel-900/40">
                      <span className="text-steel-500 dark:text-steel-400">Planned</span>
                      <p className="font-semibold text-ink-900 dark:text-white">{verification.plannedT.toFixed(1)} t</p>
                    </div>
                    <div className="rounded border border-steel-200 bg-steel-50/70 p-2 dark:border-steel-700 dark:bg-steel-900/40">
                      <span className="text-steel-500 dark:text-steel-400">Weighed Gross</span>
                      <p className="font-semibold text-ink-900 dark:text-white">{verification.actualT.toFixed(1)} t</p>
                    </div>
                    <div className="rounded border border-emerald-200 bg-emerald-50/60 p-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <span className="text-emerald-700 dark:text-emerald-400">Accepted</span>
                      <p className="font-bold text-emerald-800 dark:text-emerald-300">{verification.acceptedT.toFixed(1)} t</p>
                    </div>
                    <div className="rounded border border-red-200 bg-red-50/60 p-2 dark:border-red-900/40 dark:bg-red-950/20">
                      <span className="text-red-700 dark:text-red-400">Rejected</span>
                      <p className="font-bold text-red-800 dark:text-red-300">{verification.rejectedT.toFixed(1)} t</p>
                    </div>
                  </div>

                  {verification.rejectReason && (
                    <div className="rounded border border-red-200 bg-red-50/50 p-2.5 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                      <strong>Rejection Reason:</strong> {verification.rejectReason}
                    </div>
                  )}

                  {isVerified && (
                    <div className="rounded-lg border border-loop-200 bg-loop-50/60 p-3 text-xs text-steel-700 dark:border-loop-900/40 dark:bg-loop-950/20 dark:text-steel-300">
                      <p className="font-semibold text-loop-950 dark:text-[#B7F34A]">
                        ✓ Exactly {verification.acceptedT.toFixed(1)} t has entered Receiver Inventory under Material Passport {material?.id}.
                      </p>
                      {verification.rejectedT > 0 && (
                        <p className="mt-1 text-red-700 dark:text-red-400">
                          ✕ {verification.rejectedT.toFixed(1)} t rejected ({verification.rejectReason || "Quality variance"}). Quarantined in allocation ledger and deducted from available resale stock. Escrow authorization for rejected quantity is refunded back to receiver.
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-3">
                        <Link
                          to="/app/verification"
                          className="font-bold text-loop-700 underline hover:text-loop-800 dark:text-[#B7F34A]"
                        >
                          View Official Proof of Recovery Record →
                        </Link>
                        {material?.id && (
                          <Link
                            to={`/app/materials/${material.id}`}
                            className="font-semibold text-steel-600 underline hover:text-ink-900 dark:text-gray-300"
                          >
                            View Material Passport →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Role Action: Verification Form for Receiver when pending */}
                  {isReceiver && verification.status === "pending" && (
                    <div className="rounded-lg border border-steel-300 bg-steel-50/80 p-3.5 dark:border-steel-700 dark:bg-steel-900/60">
                      <h5 className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                        Perform Quantity Reconciliation & Acceptance
                      </h5>
                      <p className="mt-0.5 text-[11px] text-steel-600 dark:text-steel-400">
                        Accepted and rejected quantities must sum exactly to the weighed gross ({verification.actualT.toFixed(1)} t).
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="verify-accepted-tonnes" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Accepted Quantity (t):
                          </label>
                          <input
                            id="verify-accepted-tonnes"
                            type="number"
                            step="0.1"
                            min="0"
                            max={verification.actualT}
                            value={acceptedTInput}
                            onChange={(e) => {
                              const acc = Number(e.target.value);
                              setAcceptedTInput(e.target.value);
                              setRejectedTInput(Math.max(0, Math.round((verification.actualT - acc) * 10) / 10).toString());
                            }}
                            className="mt-1 block w-full rounded border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                        </div>

                        <div>
                          <label htmlFor="verify-rejected-tonnes" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Rejected Quantity (t):
                          </label>
                          <input
                            id="verify-rejected-tonnes"
                            type="number"
                            step="0.1"
                            min="0"
                            max={verification.actualT}
                            value={rejectedTInput}
                            onChange={(e) => {
                              const rej = Number(e.target.value);
                              setRejectedTInput(e.target.value);
                              setAcceptedTInput(Math.max(0, Math.round((verification.actualT - rej) * 10) / 10).toString());
                            }}
                            className="mt-1 block w-full rounded border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                        </div>
                      </div>

                      {Number(rejectedTInput) > 0 && (
                        <div className="mt-2.5">
                          <label htmlFor="verify-rejection-reason" className="block text-xs font-medium text-steel-700 dark:text-steel-300">
                            Reason for rejection (mandatory for rejected material):
                          </label>
                          <input
                            id="verify-rejection-reason"
                            type="text"
                            placeholder="e.g. Moisture excess, off-spec contamination, grading non-compliance"
                            value={rejectReasonInput}
                            onChange={(e) => setRejectReasonInput(e.target.value)}
                            className="mt-1 block w-full rounded border border-steel-300 bg-white px-2.5 py-1.5 text-xs text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                          />
                        </div>
                      )}

                      {verifyError && <p className="mt-1 text-xs text-signal-600">{verifyError}</p>}

                      <div className="mt-3">
                        <Button
                          id="confirm-verification-btn"
                          size="sm"
                          disabled={saving || (Number(rejectedTInput) > 0 && !rejectReasonInput.trim())}
                          onClick={() => {
                            const acc = Number(acceptedTInput);
                            const rej = Number(rejectedTInput);
                            if (Math.abs(acc + rej - verification.actualT) > 0.001) {
                              setVerifyError(`Accepted (${acc}) + Rejected (${rej}) must equal Weighed (${verification.actualT})`);
                              return;
                            }
                            setVerifyError("");
                            void runAction(() => verifyLoadAction(verification.id, acc, rej, rej > 0 ? rejectReasonInput : undefined));
                          }}
                        >
                          Confirm Verification & Settle Inventory
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 8: Demo Payment, Escrow, Refund & Payout          */}
          {/* ----------------------------------------------------------- */}
          <li className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              isSettled ? "bg-loop-600" : payment ? "bg-blue-600" : "bg-steel-300 dark:bg-steel-700"
            )}>
              {isSettled ? <CheckCircleIcon className="size-3.5" /> : <span className="text-[10px]">8</span>}
            </span>
            <div className="rounded-xl border border-steel-200 bg-white p-3.5 shadow-sm dark:border-steel-800 dark:bg-[#18261c]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  8. Demo Payment, Escrow & Provider Payout
                </span>
                <span className="rounded bg-steel-100 px-2 py-0.5 text-[10px] font-semibold text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                  DEMO — No real money charged
                </span>
              </div>

              {/* Financial settlement breakdown table */}
              <div className="mt-3 space-y-2 rounded-lg border border-steel-200 bg-steel-50/60 p-3 text-xs dark:border-steel-700 dark:bg-steel-900/40">
                <div className="flex justify-between">
                  <span className="text-steel-600 dark:text-steel-400">Ex-Works Material Subtotal ({booking.tonnesT.toFixed(1)} t @ {formatINRPerT(unitPrice)})</span>
                  <span className="font-medium text-ink-900 dark:text-white">{formatINR(totalValue)}</span>
                </div>
                {landedCalc && landedCalc.reusableLogisticsPerT > 0 && (
                  <div className="flex justify-between">
                    <span className="text-steel-600 dark:text-steel-400">
                      Estimated Road Freight &amp; Handling ({receiverFacility?.distanceKm ?? 35} km corridor)
                    </span>
                    <span className="font-medium text-ink-900 dark:text-white">
                      {formatINR(landedCalc.reusableLogisticsPerT * booking.tonnesT)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-steel-600 dark:text-steel-400">Applicable GST (18% Ex-Works, Invoiced by Seller)</span>
                  <span className="font-medium text-ink-900 dark:text-white">{formatINR(gstValue)}</span>
                </div>
                <div className="flex justify-between border-t border-steel-200 pt-1.5 font-bold dark:border-steel-700">
                  <span className="text-ink-900 dark:text-white">Simulated Escrow Commitment (Ex-Works Material)</span>
                  <span className="text-loop-700 dark:text-[#B7F34A]">
                    {payment ? formatINR(payment.amountMinor / 100) : formatINR(totalValue)}
                  </span>
                </div>

                {payment && (
                  <div className="mt-2 border-t border-steel-200 pt-2 text-[11px] text-steel-600 dark:border-steel-700 dark:text-steel-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Simulated Escrow Authorized:</span>
                      <strong className="text-ink-900 dark:text-white uppercase">{formatINR(payment.amountMinor / 100)} ({payment.paymentStatus})</strong>
                    </div>
                    {payment.commissionMinor > 0 && (
                      <div className="flex justify-between">
                        <span>GreenLoop Platform Fee (5% on accepted):</span>
                        <span>{formatINR(payment.commissionMinor / 100)}</span>
                      </div>
                    )}
                    {payment.refundAmountMinor > 0 && (
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                        <span>Quarantined Rejected Load Refund:</span>
                        <span>{formatINR(payment.refundAmountMinor / 100)} ({payment.refundStatus})</span>
                      </div>
                    )}
                    {payment.payoutAmountMinor > 0 && (
                      <div className="flex justify-between text-loop-700 dark:text-[#B7F34A] font-semibold">
                        <span>Net Provider Payout Released:</span>
                        <span>{formatINR(payment.payoutAmountMinor / 100)} ({payment.payoutStatus})</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isReceiver && (!payment || payment.paymentStatus === "failed") && !isCancelled && (
                  <Button size="sm" onClick={() => setCheckoutOpen(true)}>
                    Pay Now (Demo Checkout)
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={isGeneratingReceipt}
                  onClick={() => void handleDownloadInvoice()}
                >
                  {isGeneratingReceipt ? "Generating PDF…" : "Download Tax Invoice / Receipt"}
                </Button>

                {allPayments.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryOpen(!historyOpen)}
                  >
                    {historyOpen ? "Hide Attempts" : `View Attempts (${allPayments.length})`}
                  </Button>
                )}

                {/* Dispute Trigger for Receiver */}
                {isReceiver && inTransit && payment && payment.payoutStatus !== "settled" && !isDisputed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsDisputing(!isDisputing)}
                  >
                    Raise Dispute
                  </Button>
                )}
              </div>

              {/* Dispute Input Drawer */}
              {isDisputing && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                  <p className="text-xs font-semibold text-red-900 dark:text-red-200">
                    File a Delivery or Payment Dispute
                  </p>
                  <p className="mt-0.5 text-[11px] text-red-800/80 dark:text-red-300/80">
                    Disputing will hold payout release until GreenLoop operations reviews the delivery.
                  </p>
                  <textarea
                    rows={2}
                    placeholder="Describe the discrepancy, delivery delay, or quality mismatch..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="mt-2 block w-full rounded border border-red-300 bg-white p-2 text-xs text-ink-900 dark:border-red-800 dark:bg-black dark:text-white"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={saving || !disputeReason.trim()}
                      onClick={() => runAction(async () => {
                        const ok = await disputePaymentAction(booking.id, disputeReason);
                        if (ok) {
                          setIsDisputing(false);
                          setDisputeReason("");
                        }
                        return ok;
                      })}
                    >
                      Submit Dispute
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsDisputing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Payment Attempt History Table */}
              {historyOpen && allPayments.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-steel-200 text-[11px] dark:border-steel-700">
                  <table className="min-w-full divide-y divide-steel-200 dark:divide-steel-700">
                    <thead className="bg-steel-50 dark:bg-steel-900">
                      <tr>
                        <th className="px-2.5 py-1.5 text-start font-medium text-steel-500">Attempt ID</th>
                        <th className="px-2.5 py-1.5 text-start font-medium text-steel-500">Gateway</th>
                        <th className="px-2.5 py-1.5 text-start font-medium text-steel-500">Status</th>
                        <th className="px-2.5 py-1.5 text-start font-medium text-steel-500">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100 dark:divide-steel-800">
                      {allPayments.map((p) => (
                        <tr key={p.attemptId}>
                          <td className="px-2.5 py-1.5 font-mono text-ink-900 dark:text-white">{p.attemptId}</td>
                          <td className="px-2.5 py-1.5 uppercase text-steel-600 dark:text-steel-400">{p.provider}</td>
                          <td className="px-2.5 py-1.5">
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                              p.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            )}>
                              {p.paymentStatus}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-steel-500">{formatStamp(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </li>

          {/* ----------------------------------------------------------- */}
          {/* Milestone 9: Order Completion or Dispute Status            */}
          {/* ----------------------------------------------------------- */}
          <li className="ms-6">
            <span className={cn(
              "absolute -start-3 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-[#121c15]",
              isDisputed
                ? "bg-red-600"
                : isVerified && isSettled
                  ? "bg-[#B7F34A] text-ink-900 ring-emerald-200"
                  : "bg-steel-300 dark:bg-steel-700"
            )}>
              {isDisputed ? "⚠" : isVerified && isSettled ? "✓" : <span className="text-[10px]">9</span>}
            </span>
            <div className={cn(
              "rounded-xl border p-3.5 shadow-sm",
              isDisputed
                ? "border-red-300 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
                : isVerified
                  ? "border-[#B7F34A]/50 bg-[#f4fbf5] dark:border-loop-800 dark:bg-[#152419]"
                  : "border-steel-200 bg-white dark:border-steel-800 dark:bg-[#18261c]"
            )}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-archivo text-xs font-bold text-ink-900 dark:text-white">
                  9. Order Lifecycle Resolution
                </span>
                <span className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  isDisputed
                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                    : isVerified
                      ? "bg-loop-100 text-loop-800 dark:bg-loop-900/80 dark:text-[#B7F34A]"
                      : "bg-steel-100 text-steel-600 dark:bg-steel-800 dark:text-steel-400"
                )}>
                  {isDisputed ? "Disputed" : isVerified ? (verification?.status === "verified" ? "Verified & Settled" : "Rejected & Closed") : "In Progress"}
                </span>
              </div>

              {isDisputed ? (
                <div className="mt-2 text-xs text-red-900 dark:text-red-200">
                  <p><strong>Dispute Active:</strong> {payment?.disputeReason ?? "Under review by GreenLoop operations."}</p>
                  <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
                    Payout has been frozen. You will be contacted via registered email regarding resolution.
                  </p>
                </div>
              ) : isVerified ? (
                <p className="mt-1 text-xs text-steel-600 dark:text-steel-300">
                  Order successfully reconciled and closed. Material inventory is active on the receiver ledger and audit trail is permanently preserved.
                </p>
              ) : (
                <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">
                  Order is progressing through the GreenLoop circular procurement workflow.
                </p>
              )}
            </div>
          </li>
        </ol>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. Receiver Checkout Modal                                    */}
      {/* ------------------------------------------------------------- */}
      {checkoutOpen && (
        <ReceiverCheckoutModal
          isOpen={checkoutOpen}
          booking={booking}
          material={material}
          agreedPricePerT={unitPrice}
          existingPayment={payment}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </article>
  );
}
