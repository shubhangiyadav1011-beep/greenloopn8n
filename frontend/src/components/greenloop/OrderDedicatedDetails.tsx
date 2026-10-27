import { useState } from "react";
import { Link } from "react-router";
import ReceiverCheckoutModal from "./ReceiverCheckoutModal";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import { generateOrderInvoice, type OrderInvoiceData } from "@/lib/orderInvoice";
import { uploadFile } from "@/lib/api";
import { materialMediaFor } from "@/config/appMedia";
import { cn, formatDate, materialTypeLabel } from "@/utils";
import type { Booking, BookingPayment, Evidence } from "@shared/domain/types";

interface OrderDedicatedDetailsProps {
  booking: Booking;
  onBackToOrders: () => void;
  onPaymentSuccess?: (payment: BookingPayment, bookingId: string) => void;
}

export default function OrderDedicatedDetails({
  booking,
  onBackToOrders,
  onPaymentSuccess,
}: OrderDedicatedDetailsProps) {
  const {
    dataset,
    updateDeliveryAction,
    dispatchAction,
    receiveLoadAction,
    verifyLoadAction,
  } = useGreenLoopStore();
  const { user } = useAuth();

  const isReceiver = user?.activeWorkspace === "receiver";
  const isProvider = !isReceiver;

  // Local UI states
  const [copied, setCopied] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);

  // Dispatch modal / inputs
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [carrierPlate, setCarrierPlate] = useState("DL-01-GL-4482");
  const [manifestFile, setManifestFile] = useState<File | null>(null);

  // Weighbridge / Verification modal
  const [showWeighbridgeModal, setShowWeighbridgeModal] = useState(false);
  const [actualTInput, setActualTInput] = useState(booking.tonnesT.toString());
  const [ticketFile, setTicketFile] = useState<File | null>(null);

  // Resolved entities
  const material = dataset.materials.find((m) => m.id === booking.materialId);
  const project = dataset.projects.find((p) => p.id === material?.projectId);
  const receiverFacility = dataset.receivers.find((r) => r.id === booking.receiverId);
  const slot = dataset.slots.find((s) => s.id === booking.slotId);
  const offer = dataset.offers?.find(
    (o) =>
      o.id === booking.offerId ||
      (booking.demandId && o.demandId === booking.demandId && o.passportId === booking.materialId)
  );

  const unitPrice =
    booking.agreedPricePerT ??
    offer?.agreedPricePerT ??
    offer?.pricePerT ??
    material?.pricePerT ??
    4900;
  const materialPrice = Math.round(booking.tonnesT * unitPrice);
  const deliveryCharges = 20000;
  const totalPayable = materialPrice + deliveryCharges;

  const projectLocation = project ? `${project.name}, ${project.location}` : "Project 1, Delhi";
  const materialTitle = material?.name || (material?.type ? materialTypeLabel(material.type) : "Concrete");
  const gradeBadge = `Grade ${material?.grade || "A"}`;
  const media = materialMediaFor(material?.type ?? "concrete");

  // Events & milestones
  const events = dataset.events.filter((e) => e.subjectIds.includes(booking.id));
  const readyEvent = events.find((e) => e.kind === "delivery.ready");
  const pickedEvent = events.find((e) => e.kind === "delivery.picked-up");
  const dispatchedEvent = events.find((e) => e.kind === "load.dispatched");
  const isDispatched = Boolean(booking.loadRef || dispatchedEvent);

  const verification = dataset.verifications.find((v) => v.bookingId === booking.id);
  const isVerified = verification && ["verified", "rejected"].includes(verification.status);

  const allPayments = (dataset.payments || []).filter((p) => p.bookingId === booking.id);
  const payment: BookingPayment | undefined = allPayments[0];
  const isPaid = payment?.paymentStatus === "paid" || payment?.paymentStatus === "adjustment";
  const isSettled = payment?.payoutStatus === "settled";

  // Scheduled date display
  const deliveryDateFormatted = slot?.date
    ? formatDate(slot.date)
    : (() => {
        const d = new Date(booking.createdAt || Date.now());
        d.setDate(d.getDate() + 5);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      })();

  // Copy ID helper
  const handleCopyId = () => {
    navigator.clipboard.writeText(booking.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tax Invoice Download helper
  const handleDownloadInvoice = async () => {
    if (!payment) return;
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
          address: projectLocation,
        },
        receiver: {
          name: user?.name || "Material Receiver",
          organization: receiverFacility?.name || user?.organization || "Intake Facility",
          email: user?.email,
          address: receiverFacility?.location || "Delhi Yard",
        },
        projectName: project?.name,
        projectLocation: projectLocation,
        materialId: booking.materialId,
        materialType: materialTitle,
        quantityT: booking.tonnesT,
        unitPricePerT: unitPrice,
        payment,
      };

      const doc = await generateOrderInvoice(invoiceData);
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GreenLoop-Invoice-${booking.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Receipt download failed:", e);
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  // Dispatch submission
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    setActionError("");
    try {
      const documents: Evidence[] = [];
      if (manifestFile) {
        const manifestRef = await uploadFile(manifestFile);
        documents.push({
          kind: "chain-of-custody",
          label: `${manifestFile.name} (${carrierPlate})`,
          ref: manifestRef,
          recordedAt: new Date().toISOString(),
        });
      } else if (carrierPlate) {
        documents.push({
          kind: "chain-of-custody",
          label: `Dispatch Manifest - Plate ${carrierPlate}`,
          recordedAt: new Date().toISOString(),
        });
      }
      const ok = await dispatchAction({
        bookingId: booking.id,
        documents: documents.length ? documents : undefined,
      });
      if (ok) {
        setShowDispatchModal(false);
      } else {
        setActionError("Dispatch could not be recorded. Ensure cargo has been staged and picked up.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Dispatch submission failed.");
    } finally {
      setActionBusy(false);
    }
  };

  // Weighbridge Intake & Verification submission
  const handleWeighbridgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    setActionError("");
    try {
      const actualT = Number(actualTInput) || booking.tonnesT;
      const evidenceList: Evidence[] = [];
      if (ticketFile) {
        const ref = await uploadFile(ticketFile);
        evidenceList.push({
          kind: "weighbridge-ticket",
          label: ticketFile.name,
          ref,
          recordedAt: new Date().toISOString(),
        });
      }
      const okReceive = await receiveLoadAction(booking.id, actualT, evidenceList);
      if (okReceive) {
        const updatedVer = dataset.verifications.find((v) => v.bookingId === booking.id);
        if (updatedVer) {
          await verifyLoadAction(updatedVer.id, actualT, 0);
        }
        setShowWeighbridgeModal(false);
      } else {
        setActionError("Failed to record weighbridge intake.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Intake verification failed.");
    } finally {
      setActionBusy(false);
    }
  };

  // Determine active step index (1-based)
  let activeStep = 1;
  if (booking.status === "cancelled") {
    activeStep = 1;
  } else if (!isPaid) {
    activeStep = 3; // Step 3: Payment & Escrow
  } else if (!isVerified) {
    activeStep = 4; // Step 4: Delivery & Verification
  } else {
    activeStep = isSettled ? 5 : 5; // Step 5: Completion & Payout
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------- */}
      {/* Top Header: Back to Orders Navigation                         */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          id="back-to-orders-btn"
          onClick={onBackToOrders}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-2xs hover:bg-gray-50 dark:border-steel-800 dark:bg-[#16271e] dark:text-gray-300 transition"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Back to Orders</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Link to="/app/orders" onClick={onBackToOrders} className="hover:underline">
            Orders
          </Link>
          <span>/</span>
          <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{booking.id}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. Header Card (Matching Reference Screenshot)                */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-steel-800 dark:bg-[#16271e]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          {/* Left: Material Image & Specs */}
          <div className="flex items-start sm:items-center gap-4">
            <img
              src={media.src}
              alt={materialTitle}
              className="size-20 sm:size-24 rounded-2xl object-cover border border-gray-100 shadow-2xs shrink-0 dark:border-steel-800"
            />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-archivo text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {materialTitle}
                </h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {gradeBadge}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                {/* Quantity */}
                <div className="flex items-center gap-1.5">
                  <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  <span className="font-medium">{booking.tonnesT} tonnes</span>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1.5">
                  <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{projectLocation}</span>
                </div>

                {/* Delivery Date */}
                <div className="flex items-center gap-1.5">
                  <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                  <span>Delivery by {deliveryDateFormatted}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Order ID & Status Badge */}
          <div className="w-full sm:w-auto shrink-0 rounded-2xl bg-[#f0f9f3] p-4 border border-emerald-100/70 dark:bg-emerald-950/40 dark:border-emerald-900/40 text-start sm:text-end">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-900/80 dark:text-emerald-300/80">
              Order ID
            </span>
            <div className="flex items-center sm:justify-end gap-2 mt-0.5">
              <span className="font-archivo text-2xl font-bold text-gray-900 dark:text-white">
                {booking.id}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Order ID"
                className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-emerald-100/50 dark:hover:text-white transition"
              >
                {copied ? (
                  <svg className="size-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                )}
              </button>
            </div>

            <div className="mt-1 flex items-center sm:justify-end gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-600" />
              <span>{booking.status === "cancelled" ? "Cancelled" : isVerified ? "Completed" : isDispatched ? "In Transit" : "Confirmed"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. 5-Step Horizontal Progress Tracker (Exact Reference Image) */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-steel-800 dark:bg-[#16271e]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-2 sm:px-4">
          {/* Step 1: Request & Match */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#164b2d] text-white shadow-2xs">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="mt-2 text-xs font-bold text-gray-900 dark:text-white">Request &amp; Match</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">26 Oct 2026</span>
          </div>

          <div className="mx-2 sm:mx-3 h-0.5 flex-1 max-w-[90px] bg-emerald-600" style={{ marginBottom: "1.25rem" }} />

          {/* Step 2: Negotiation & Terms */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#164b2d] text-white shadow-2xs">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="mt-2 text-xs font-bold text-gray-900 dark:text-white">Negotiation &amp; Terms</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">26 Oct 2026</span>
          </div>

          <div
            className={cn(
              "mx-2 sm:mx-3 h-0.5 flex-1 max-w-[90px] transition-all",
              activeStep >= 3 ? "bg-emerald-600" : "bg-gray-200 dark:bg-steel-700"
            )}
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 3: Payment & Escrow */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full font-bold text-xs sm:text-sm text-white shadow-2xs transition-all",
                isPaid
                  ? "bg-[#164b2d]"
                  : "bg-[#164b2d] ring-4 ring-emerald-100 dark:ring-emerald-950"
              )}
            >
              {isPaid ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                "3"
              )}
            </div>
            <span
              className={cn(
                "mt-2 text-xs font-bold",
                !isPaid ? "text-emerald-800 dark:text-emerald-400" : "text-gray-900 dark:text-white"
              )}
            >
              Payment &amp; Escrow
            </span>
            <span
              className={cn(
                "text-[11px] font-semibold mt-0.5",
                !isPaid ? "text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"
              )}
            >
              {!isPaid ? "Current Step" : "Completed ✓"}
            </span>
          </div>

          <div
            className={cn(
              "mx-2 sm:mx-3 h-0.5 flex-1 max-w-[90px] transition-all",
              activeStep >= 4 ? "bg-emerald-600" : "bg-gray-200 dark:bg-steel-700"
            )}
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 4: Delivery & Verification */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full font-bold text-xs transition-all",
                isVerified
                  ? "bg-[#164b2d] text-white"
                  : activeStep === 4
                  ? "bg-[#164b2d] text-white ring-4 ring-emerald-100 dark:ring-emerald-950"
                  : "border border-gray-300 bg-white text-gray-400 dark:border-steel-700 dark:bg-[#16271e]"
              )}
            >
              {isVerified ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                "4"
              )}
            </div>
            <span
              className={cn(
                "mt-2 text-xs",
                activeStep === 4 ? "font-bold text-emerald-800 dark:text-emerald-400" : "font-medium text-gray-500 dark:text-gray-400"
              )}
            >
              Delivery &amp; Verification
            </span>
            <span
              className={cn(
                "text-[11px] mt-0.5",
                activeStep === 4 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-gray-400"
              )}
            >
              {isVerified ? "Verified ✓" : activeStep === 4 ? "Current Step" : "Upcoming"}
            </span>
          </div>

          <div
            className={cn(
              "mx-2 sm:mx-3 h-0.5 flex-1 max-w-[90px] transition-all",
              activeStep >= 5 ? "bg-emerald-600" : "bg-gray-200 dark:bg-steel-700"
            )}
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 5: Completion & Payout */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full font-bold text-xs transition-all",
                isSettled
                  ? "bg-[#164b2d] text-white"
                  : activeStep === 5
                  ? "bg-[#164b2d] text-white ring-4 ring-emerald-100 dark:ring-emerald-950"
                  : "border border-gray-300 bg-white text-gray-400 dark:border-steel-700 dark:bg-[#16271e]"
              )}
            >
              {isSettled ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                "5"
              )}
            </div>
            <span
              className={cn(
                "mt-2 text-xs",
                activeStep === 5 ? "font-bold text-emerald-800 dark:text-emerald-400" : "font-medium text-gray-500 dark:text-gray-400"
              )}
            >
              Completion &amp; Payout
            </span>
            <span
              className={cn(
                "text-[11px] mt-0.5",
                activeStep === 5 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-gray-400"
              )}
            >
              {isSettled ? "Settled ✓" : activeStep === 5 ? "Current Step" : "Upcoming"}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. Concise Payment & Escrow Section (Exact Reference Card)    */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-steel-800 dark:bg-[#16271e]">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5">
          {/* Left: Wallet Icon and Explanation */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-[#164b2d] dark:bg-emerald-950/60 dark:text-emerald-300 shadow-2xs">
              <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
            </div>
            <div>
              <h3 className="font-archivo text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                Payment &amp; Escrow
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-xl leading-relaxed">
                {isPaid
                  ? "Funds are securely locked in GreenLoop escrow and will be released to the provider upon weighbridge verification."
                  : "Pay to hold this order in GreenLoop escrow. The amount will be released to the provider after delivery confirmation."}
              </p>
            </div>
          </div>

          {/* Right: Amount & Action Button */}
          <div className="flex items-center justify-between lg:justify-end gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-steel-800">
            <div className="hidden lg:block h-12 w-px bg-gray-200 dark:bg-steel-700" />

            {!isPaid ? (
              <>
                <div className="text-start lg:text-end">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">
                    Amount to Pay
                  </span>
                  <span className="font-archivo text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    ₹{totalPayable.toLocaleString("en-IN")}
                  </span>
                </div>

                <button
                  type="button"
                  id="pay-now-action-btn"
                  onClick={() => setCheckoutOpen(true)}
                  className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] text-white px-6 py-3.5 font-bold text-sm shadow-sm transition flex items-center gap-2 shrink-0 dark:bg-[#1e5836] dark:hover:bg-[#266e44]"
                >
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Pay Now</span>
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-start lg:text-end">
                  <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Escrow Funded
                  </span>
                  <p className="font-archivo text-xl font-bold text-[#164b2d] dark:text-emerald-400 mt-0.5">
                    ₹{totalPayable.toLocaleString("en-IN")} Locked
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadInvoice}
                  disabled={isGeneratingReceipt}
                  className="rounded-xl border border-gray-300 hover:bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800 transition"
                >
                  {isGeneratingReceipt ? "Generating…" : "Download Receipt (PDF)"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. Contextual Actions (Appears ONLY when required by stage!)   */}
      {/* ------------------------------------------------------------- */}
      {/* Case A: Stage 4 — Provider Staging & Haulier Pickup Actions */}
      {isPaid && !isDispatched && isProvider && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900 uppercase">
                  Provider Action Required
                </span>
                <span className="text-xs text-blue-800 font-semibold">Stage 4: Fulfilment</span>
              </div>
              <h4 className="font-archivo text-base font-bold text-blue-950 dark:text-blue-100 mt-1">
                {!readyEvent
                  ? "Stage Cargo for Haulier Pickup"
                  : !pickedEvent
                  ? "Confirm Haulier Cargo Pickup"
                  : "Dispatch Load with Carrier Vehicle Details"}
              </h4>
              <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">
                {!readyEvent
                  ? "Mark the 10.0 tonnes of material as ready and staged in the loading yard."
                  : !pickedEvent
                  ? "Confirm that the transport vehicle has arrived and loaded the consignment."
                  : "Assign vehicle registration plate and dispatch manifest to authorize transport."}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!readyEvent && (
                <button
                  type="button"
                  id="stage-cargo-btn"
                  disabled={actionBusy}
                  onClick={async () => {
                    setActionBusy(true);
                    try {
                      await updateDeliveryAction(booking.id, "ready");
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="rounded-xl bg-blue-800 hover:bg-blue-900 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition"
                >
                  {actionBusy ? "Updating…" : "📦 Mark Staged for Pickup"}
                </button>
              )}

              {readyEvent && !pickedEvent && (
                <button
                  type="button"
                  id="confirm-pickup-btn"
                  disabled={actionBusy}
                  onClick={async () => {
                    setActionBusy(true);
                    try {
                      await updateDeliveryAction(booking.id, "picked-up");
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="rounded-xl bg-blue-800 hover:bg-blue-900 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition"
                >
                  {actionBusy ? "Updating…" : "🚚 Confirm Haulier Pickup"}
                </button>
              )}

              {pickedEvent && !isDispatched && (
                <button
                  type="button"
                  id="open-dispatch-modal-btn"
                  onClick={() => setShowDispatchModal(true)}
                  className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] text-white px-4 py-2.5 text-xs font-bold shadow-xs transition"
                >
                  📋 Dispatch Load &amp; Attach Manifest →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Case B: Stage 4 — Receiver Verification (When Dispatched) */}
      {isDispatched && !isVerified && isReceiver && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 uppercase">
                  Receiver Action Required
                </span>
                <span className="text-xs text-emerald-800 font-semibold">Stage 4: Intake &amp; Weighbridge</span>
              </div>
              <h4 className="font-archivo text-base font-bold text-emerald-950 dark:text-emerald-100 mt-1">
                Load {booking.loadRef ? `#${booking.loadRef}` : "En Route"} — Verify Delivery &amp; Record Weight
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Carrier has dispatched this load. Record the intake weighbridge reading and approve material quality to complete escrow release.
              </p>
            </div>

            <button
              type="button"
              id="open-weighbridge-modal-btn"
              onClick={() => setShowWeighbridgeModal(true)}
              className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] text-white px-5 py-2.5 text-xs font-bold shadow-xs transition shrink-0"
            >
              ⚖️ Record Intake &amp; Verify Delivery →
            </button>
          </div>
        </div>
      )}

      {/* Case C: Stage 5 — Completed Order Proof & Invoicing */}
      {isVerified && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 dark:border-steel-800 dark:bg-[#16271e]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h4 className="font-archivo text-base font-bold text-gray-900 dark:text-white">
                  Delivery Verified &amp; Settlement Ready
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Weighbridge intake accepted ({verification?.acceptedT ?? booking.tonnesT} tonnes). Audit trail locked.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/app/receiver/verification?booking=${encodeURIComponent(booking.id)}`}
                className="rounded-xl border border-gray-300 hover:bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:border-steel-700 dark:text-gray-300 transition"
              >
                View Proof Details
              </Link>
              <button
                type="button"
                onClick={handleDownloadInvoice}
                disabled={isGeneratingReceipt}
                className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] text-white px-4 py-2 text-xs font-bold transition"
              >
                {isGeneratingReceipt ? "Generating…" : "📥 Tax Invoice (PDF)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modals: Checkout, Dispatch, Weighbridge                       */}
      {/* ------------------------------------------------------------- */}
      {checkoutOpen && (
        <ReceiverCheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          booking={booking}
          material={material}
          agreedPricePerT={unitPrice}
          existingPayment={payment}
          onPaymentSuccess={(p, bId) => {
            if (onPaymentSuccess) onPaymentSuccess(p, bId);
          }}
        />
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#16271e] border border-gray-200 dark:border-steel-700">
            <h3 className="font-archivo text-lg font-bold text-gray-900 dark:text-white">
              Dispatch Load #{booking.id}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Provide vehicle plate number and transport manifest.
            </p>

            <form onSubmit={handleDispatchSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Carrier Vehicle Plate Number
                </label>
                <input
                  type="text"
                  required
                  value={carrierPlate}
                  onChange={(e) => setCarrierPlate(e.target.value)}
                  placeholder="e.g. DL-01-AB-1234"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-steel-700 dark:bg-[#122319] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Attach Manifest or Transit Pass (PDF / Image)
                </label>
                <input
                  type="file"
                  onChange={(e) => setManifestFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500"
                />
              </div>

              {actionError && (
                <p className="text-xs font-semibold text-rose-600">{actionError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {actionBusy ? "Dispatching…" : "Confirm Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Weighbridge Intake Modal */}
      {showWeighbridgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#16271e] border border-gray-200 dark:border-steel-700">
            <h3 className="font-archivo text-lg font-bold text-gray-900 dark:text-white">
              Weighbridge Intake &amp; QA Verification
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Record gross and tare readings to verify received tonnage.
            </p>

            <form onSubmit={handleWeighbridgeSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Actual Received Net Tonnes
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={actualTInput}
                  onChange={(e) => setActualTInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-steel-700 dark:bg-[#122319] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Upload Weighbridge Gross Ticket
                </label>
                <input
                  type="file"
                  onChange={(e) => setTicketFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500"
                />
              </div>

              {actionError && (
                <p className="text-xs font-semibold text-rose-600">{actionError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWeighbridgeModal(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-xl bg-[#164b2d] hover:bg-[#123e25] px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {actionBusy ? "Verifying…" : "Approve & Release QA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
