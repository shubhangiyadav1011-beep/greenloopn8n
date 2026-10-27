import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import type { Booking, BookingPayment, MaterialPassport, ProviderMaterialListing } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { generateOrderInvoice, type OrderInvoiceData } from "@/lib/orderInvoice";
import { useAuth } from "@/context/AuthContext.helpers";
import { useNavigate } from "react-router";
import { materialMediaFor } from "@/config/appMedia";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import { materialTypeLabel } from "@/utils";

interface ReceiverCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: Booking;
  listing?: ProviderMaterialListing;
  material?: MaterialPassport;
  agreedPricePerT?: number;
  defaultQuantityT?: number;
  existingPayment?: BookingPayment;
  onPaymentSuccess?: (payment: BookingPayment, bookingId: string) => void;
}

const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);

export default function ReceiverCheckoutModal({
  isOpen,
  onClose,
  booking: initialBooking,
  listing,
  material: initialMaterial,
  agreedPricePerT: initialAgreedPricePerT,
  defaultQuantityT,
  existingPayment,
  onPaymentSuccess,
}: ReceiverCheckoutModalProps) {
  const { dataset, createPaymentAttemptAction, directOrderMaterialAction } = useGreenLoopStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Material & listing resolution
  const material =
    initialMaterial ||
    (listing ? dataset.materials.find((m) => m.id === listing.materialId) : undefined) ||
    (initialBooking ? dataset.materials.find((m) => m.id === initialBooking.materialId) : undefined);
  const effectivePricePerT =
    initialAgreedPricePerT ?? initialBooking?.agreedPricePerT ?? listing?.pricePerT ?? material?.pricePerT ?? 4900;
  const maxAvailableT = listing?.availableT ?? material?.quantityT ?? 100;

  // Quantity & Delivery defaults
  const initialQty = Math.max(
    1,
    Math.min(maxAvailableT, initialBooking?.tonnesT ?? defaultQuantityT ?? (maxAvailableT > 10 ? 10 : maxAvailableT))
  );
  const [orderQuantityT] = useState<string>(initialQty.toString());
  const [destination] = useState<string>(user?.location || "Project 1, Delhi");
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDate =
    listing?.availableFrom && listing.availableFrom > todayStr
      ? listing.availableFrom
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 5);
          return d.toISOString().slice(0, 10);
        })();
  const [deliveryDate] = useState<string>(defaultDate);

  // Active booking & payment states
  const [activeBooking, setActiveBooking] = useState<Booking | null>(initialBooking ?? null);
  const [step, setStep] = useState<"initializing" | "qr" | "success" | "failed">(
    existingPayment?.paymentStatus === "paid" ? "success" : "initializing"
  );
  const [currentAttempt, setCurrentAttempt] = useState<BookingPayment | null>(existingPayment ?? null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [approvalUrl, setApprovalUrl] = useState<string>("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [txReference, setTxReference] = useState(existingPayment?.providerReference || "");

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const numTonnes = activeBooking ? activeBooking.tonnesT : Number(orderQuantityT) || 10;
  const unitPrice = effectivePricePerT > 0 ? effectivePricePerT : 4900;
  const materialPrice = Math.round(numTonnes * unitPrice);
  const deliveryCharges = 20000;
  const totalPayable = materialPrice + deliveryCharges;
  const totalMinor = totalPayable * 100;

  // Project details
  const project = dataset.projects.find((p) => p.id === material?.projectId);
  const projectLocation = project ? `${project.name}, ${project.location}` : listing?.projectLocation || "Project 1, Delhi";
  const materialTitle = material?.name || (material?.type ? materialTypeLabel(material.type) : "Recovered Material");
  const gradeBadge = `Grade ${material?.grade || listing?.grade || "A"}`;

  const mediaList = material ? materialMedia(material) : [];
  const materialImage = mediaList[0]?.src || materialMediaFor(material?.type || "concrete").src;

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Initialize or re-create payment session
  const initializePaymentSession = useCallback(async () => {
    if (!isOpen) return;
    stopPolling();
    setStep("initializing");
    setErrorMessage("");

    try {
      let bookingToPay = activeBooking || initialBooking;

      // If direct order mode without booking, reserve material first
      if (!bookingToPay) {
        const materialId = listing?.materialId || material?.id;
        if (!materialId) {
          throw new Error("Unable to identify material asset for checkout.");
        }
        const created = await directOrderMaterialAction({
          materialId,
          quantityT: Number(orderQuantityT) || 10,
          deliveryDate,
          destination,
          notes: "GreenLoop Escrow Secured Order",
        });
        if (!created) {
          throw new Error("Failed to reserve material stock. Please try again.");
        }
        bookingToPay = created;
        setActiveBooking(created);
      }

      // Generate a unique QR payment attempt on backend with manual approval mode
      const attempt = await createPaymentAttemptAction({
        bookingId: bookingToPay.id,
        method: "upi",
        simulateOutcome: "manual",
      });

      if (!attempt || !attempt.providerReference) {
        throw new Error("Could not initialize payment session.");
      }

      setCurrentAttempt(attempt);
      const phoneUrl = `${window.location.origin}/pay/${encodeURIComponent(attempt.providerReference)}`;
      setApprovalUrl(phoneUrl);

      // Generate high-resolution QR code
      const qrData = await QRCode.toDataURL(phoneUrl, {
        width: 260,
        margin: 1,
        color: {
          dark: "#164b2d",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });
      setQrCodeDataUrl(qrData);
      setStep("qr");

      // Start real-time polling to check if phone approved
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/session/${encodeURIComponent(attempt.providerReference)}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data?.session) {
            if (data.session.status === "paid") {
              stopPolling();
              setTxReference(data.session.transactionReference || attempt.providerReference || "UPI-GL-CONFIRMED");
              setCurrentAttempt((prev) => (prev ? { ...prev, paymentStatus: "paid" } : null));
              setStep("success");
              if (onPaymentSuccess) {
                onPaymentSuccess({ ...attempt, paymentStatus: "paid" }, bookingToPay.id);
              }
            } else if (data.session.status === "failed") {
              stopPolling();
              setStep("failed");
              setErrorMessage("Payment was cancelled or rejected on mobile.");
            }
          }
        } catch {
          // Keep polling silently on minor network blips
        }
      }, 1200);
    } catch (err) {
      stopPolling();
      setStep("failed");
      setErrorMessage(err instanceof Error ? err.message : "Failed to initialize payment session.");
    }
  }, [
    isOpen,
    activeBooking,
    initialBooking,
    listing,
    material,
    orderQuantityT,
    deliveryDate,
    destination,
    directOrderMaterialAction,
    createPaymentAttemptAction,
    onPaymentSuccess,
    stopPolling,
  ]);

  // Effect to trigger session creation when modal opens
  useEffect(() => {
    if (isOpen && step !== "success") {
      void initializePaymentSession();
    }
    return () => {
      stopPolling();
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadReceipt = async () => {
    if (!currentAttempt) return;
    setIsGeneratingPdf(true);
    try {
      const receiverFacility = dataset.receivers.find((r) => r.id === activeBooking?.receiverId);

      const invoiceData: OrderInvoiceData = {
        bookingId: activeBooking?.id || "ORDER-ESCROW-CONFIRMED",
        invoiceDate: new Date(),
        orderDate: activeBooking?.createdAt
          ? new Date(activeBooking.createdAt).toLocaleDateString("en-IN")
          : new Date().toLocaleDateString("en-IN"),
        loadReference: activeBooking?.loadRef,
        provider: {
          name: "Material Provider",
          organization: project?.name
            ? `${project.name} Site`
            : listing?.organization
              ? `${listing.organization} Depot`
              : "Provider Yard",
          email: "provider@demo.greenloop",
        },
        receiver: {
          name: user?.name || "Material Receiver",
          organization: receiverFacility?.name || user?.organization || "Receiver Facility",
          email: user?.email,
          address: destination || receiverFacility?.location,
        },
        projectName: project?.name || listing?.projectName,
        projectLocation: project?.location || listing?.projectLocation,
        materialId: activeBooking?.materialId || listing?.materialId || material?.id || "MAT",
        materialType: material?.type || listing?.materialType || "Material",
        quantityT: numTonnes,
        unitPricePerT: unitPrice,
        payment: currentAttempt,
      };

      const doc = await generateOrderInvoice(invoiceData);
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Receipt generation failed:", e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopPolling();
        onClose();
      }}
      className="max-w-4xl lg:max-w-5xl overflow-hidden p-0 rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-steel-800 dark:bg-[#122319]"
    >
      {/* 4-Step Milestone Stepper */}
      <div className="relative border-b border-gray-100 bg-[#fafcfb] px-4 py-5 sm:py-6 dark:border-steel-800 dark:bg-[#0e1c14]">
        <button
          type="button"
          onClick={() => {
            stopPolling();
            onClose();
          }}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-steel-800 dark:hover:text-white transition"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mx-auto flex max-w-2xl items-center justify-between px-2 sm:px-6">
          {/* Step 1: Negotiation Completed */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-full bg-[#164b2d] text-white shadow-2xs">
              <svg className="size-3.5 sm:size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="mt-2 text-xs font-bold text-gray-900 dark:text-white">1. Negotiation</span>
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 -mt-0.5">Completed ✓</span>
          </div>

          <div
            className="mx-2 sm:mx-3 h-0.5 flex-1 max-w-[80px] sm:max-w-[120px] bg-emerald-600 dark:bg-emerald-500"
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 2: Payment & Escrow (Active or Completed) */}
          <div className="flex flex-col items-center text-center">
            <div
              className={`flex size-7 sm:size-8 items-center justify-center rounded-full font-bold text-xs sm:text-sm text-white shadow-2xs transition-all ${
                step === "success" ? "bg-[#164b2d]" : "bg-[#164b2d] ring-4 ring-emerald-100 dark:ring-emerald-950"
              }`}
            >
              {step === "success" ? (
                <svg className="size-3.5 sm:size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                "2"
              )}
            </div>
            <span className="mt-2 text-xs font-bold text-gray-900 dark:text-white">2. Payment</span>
            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-300 -mt-0.5">
              {step === "success" ? "Secured ✓" : "& Escrow"}
            </span>
          </div>

          <div
            className={`mx-2 sm:mx-3 h-0.5 flex-1 max-w-[80px] sm:max-w-[120px] transition-all ${
              step === "success" ? "bg-emerald-600 dark:bg-emerald-500" : "bg-gray-200 dark:bg-steel-700"
            }`}
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 3: Delivery */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-400 dark:border-steel-700 dark:bg-[#16271e]">
              3
            </div>
            <span className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">Delivery</span>
            <span className="text-[11px] text-transparent select-none -mt-0.5">·</span>
          </div>

          <div
            className="mx-2 sm:mx-3 h-0.5 flex-1 max-w-[80px] sm:max-w-[120px] bg-gray-200 dark:bg-steel-700"
            style={{ marginBottom: "1.25rem" }}
          />

          {/* Step 4: Order Completed */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-400 dark:border-steel-700 dark:bg-[#16271e]">
              4
            </div>
            <span className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">Order Completed</span>
            <span className="text-[11px] text-transparent select-none -mt-0.5">·</span>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-7 lg:p-8 bg-white dark:bg-[#122319]">
        {/* State 1: Initializing */}
        {step === "initializing" && (
          <div className="py-20 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-[#164b2d] animate-pulse dark:bg-emerald-950 dark:text-emerald-300">
              <svg className="size-7 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
            <h3 className="mt-4 font-archivo text-lg font-bold text-gray-900 dark:text-white">
              Preparing UPI Escrow Session…
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Validating order terms and generating unique QR approval code
            </p>
          </div>
        )}

        {/* State 2: QR-Based UPI Checkout */}
        {step === "qr" && (
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch">
            {/* Left Column: QR Code & UPI Scan Instructions */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-archivo text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                      Scan to Pay &amp; Secure Escrow
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      Open any UPI app on your phone to approve the payment.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 border border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300">
                    Simulated Sandbox
                  </span>
                </div>

                {/* Concise Escrow Safeguard Callout */}
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f0f9f3] px-3.5 py-2.5 border border-emerald-100/70 dark:bg-emerald-950/30 dark:border-emerald-900/40">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 11 14 15 10" />
                    </svg>
                  </div>
                  <p className="text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                    Funds remain securely locked in Escrow and are released only after you confirm delivery.
                  </p>
                </div>

                {/* QR Code Scannable Card */}
                <div className="mt-5 rounded-2xl border border-gray-200/90 bg-white p-5 text-center shadow-xs dark:border-steel-800 dark:bg-[#16271e]">
                  {/* Total Payable Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-steel-800">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Total Payable
                    </span>
                    <span className="font-archivo text-xl font-bold text-[#164b2d] dark:text-emerald-400">
                      ₹{totalPayable.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* QR Image Box */}
                  <div className="my-4 flex flex-col items-center justify-center">
                    <div className="relative rounded-2xl bg-white p-3 shadow-sm border border-gray-200/80 inline-block">
                      {qrCodeDataUrl ? (
                        <img
                          src={qrCodeDataUrl}
                          alt="UPI Escrow QR Code"
                          className="size-48 sm:size-52 rounded-xl object-contain"
                        />
                      ) : (
                        <div className="size-48 sm:size-52 flex items-center justify-center bg-gray-50 rounded-xl">
                          <span className="text-xs text-gray-400">Generating QR…</span>
                        </div>
                      )}
                    </div>
                    <p className="mt-2.5 font-bold text-sm text-gray-900 dark:text-white">
                      Scan with any UPI app to pay
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Works with Google Pay, PhonePe, Paytm, BHIM or mobile banking
                    </p>
                  </div>

                  {/* UPI Brand Badges */}
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-100 dark:border-steel-800">
                    <span className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 border border-gray-200/60 dark:bg-steel-800 dark:text-gray-300">
                      GPay
                    </span>
                    <span className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 border border-gray-200/60 dark:bg-steel-800 dark:text-gray-300">
                      PhonePe
                    </span>
                    <span className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 border border-gray-200/60 dark:bg-steel-800 dark:text-gray-300">
                      Paytm
                    </span>
                    <span className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 border border-gray-200/60 dark:bg-steel-800 dark:text-gray-300">
                      BHIM UPI
                    </span>
                  </div>

                  {/* Real-time sync indicator */}
                  <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-50/70 py-2 px-3 text-xs text-emerald-900 border border-emerald-100/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
                    </span>
                    <span className="font-medium">Waiting for approval on phone…</span>
                  </div>
                </div>

                {/* Direct Desktop Test Link */}
                <div className="mt-4 flex items-center justify-between text-xs px-1">
                  <span className="text-gray-500 dark:text-gray-400">Testing on desktop?</span>
                  <a
                    href={approvalUrl}
                    target="_blank"
                    rel="noreferrer"
                    id="desktop-phone-approval-link"
                    className="font-bold text-[#164b2d] hover:underline flex items-center gap-1 dark:text-emerald-400"
                  >
                    <span>📱 Open Phone Approval Screen</span>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Bottom demo disclaimer */}
              <div className="mt-5 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-steel-800 flex items-center justify-between">
                <span>Demo Escrow Flow · No real money charged</span>
                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    onClose();
                  }}
                  className="hover:text-gray-600 dark:hover:text-gray-300 font-medium underline"
                >
                  Cancel Order
                </button>
              </div>
            </div>

            {/* Right Column: Order Summary */}
            <div className="lg:w-[42%] shrink-0">
              <div className="rounded-2xl border border-gray-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-steel-800 dark:bg-[#16271e] flex flex-col justify-between h-full">
                <div>
                  <h3 className="font-archivo text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    Order Summary
                  </h3>

                  {/* Material item */}
                  <div className="mt-4 flex items-center gap-3.5">
                    <img
                      src={materialImage}
                      alt={materialTitle}
                      className="size-16 sm:size-18 rounded-xl object-cover border border-gray-100 dark:border-steel-800 shrink-0 shadow-2xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-archivo text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                          {materialTitle}
                        </p>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                          {gradeBadge}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <svg className="size-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="truncate">{projectLocation}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <svg className="size-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
                          <path d="m3.27 6.96 8.73 4.88 8.73-4.88" />
                          <path d="M12 22.08V12" />
                        </svg>
                        <span>{numTonnes} tonnes</span>
                      </div>
                    </div>
                  </div>

                  {/* Price Breakdown */}
                  <div className="mt-5 border-t border-gray-100 pt-4 dark:border-steel-800">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                      Price Breakdown
                    </h4>
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-start justify-between text-xs">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400 font-medium">Material Price</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                            ₹{unitPrice.toLocaleString("en-IN")} / tonne × {numTonnes} t
                          </p>
                        </div>
                        <span className="font-archivo font-bold text-gray-900 dark:text-white text-sm">
                          ₹{materialPrice.toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div className="flex items-start justify-between text-xs">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400 font-medium">Delivery Charges</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Within 25 km</p>
                        </div>
                        <span className="font-archivo font-bold text-gray-900 dark:text-white text-sm">
                          ₹{deliveryCharges.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    {/* Total Highlight */}
                    <div className="my-3.5 flex items-center justify-between rounded-xl bg-[#f0f9f3] p-3.5 border border-emerald-100/60 dark:bg-emerald-950/40 dark:border-emerald-900/50">
                      <span className="font-archivo font-bold text-sm sm:text-base text-emerald-950 dark:text-emerald-100">
                        Total Payable
                      </span>
                      <span className="font-archivo text-lg sm:text-xl font-bold text-emerald-900 dark:text-emerald-200">
                        ₹{totalPayable.toLocaleString("en-IN")}
                      </span>
                    </div>

                    {/* Concise Order Terms */}
                    <div className="space-y-2.5 pt-1 text-xs">
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                        <span className="text-gray-500">Expected Delivery</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">Within 5 days</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                        <span className="text-gray-500">Payment Terms</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">100% Escrow Protected</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                        <span className="text-gray-500">Escrow Guarantee</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Included (Free)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Trust Tag */}
                <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-gray-50 p-3 border border-gray-200/60 dark:bg-[#122319] dark:border-steel-800">
                  <svg className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">
                    Payment held securely in GreenLoop Escrow until verified delivery.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Payment Successful */}
        {step === "success" && (
          <div className="space-y-6 py-6 text-center max-w-lg mx-auto">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-[#164b2d] dark:bg-emerald-950/60 dark:text-emerald-300">
              <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>

            <div>
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#164b2d] dark:bg-emerald-900 dark:text-emerald-200">
                Payment Successful · Escrow Confirmed
              </span>
              <h3 className="mt-2 font-archivo text-2xl font-bold text-gray-900 dark:text-white">
                {money(totalMinor)} Locked in Escrow
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Payment approved via UPI! Funds are securely deposited into GreenLoop Escrow and will be released only after site delivery and weighbridge verification.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="rounded-xl border border-gray-200 bg-[#fbfdfc] p-4 text-start text-xs dark:border-steel-800 dark:bg-steel-900/50">
              <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-steel-800">
                <span className="text-gray-500">Transaction Reference:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white" id="payment-tx-ref">
                  {txReference || currentAttempt?.providerReference || "UPI-GL-CONFIRMED"}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-b border-gray-100 pb-2 dark:border-steel-800">
                <span className="text-gray-500">Order ID:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">
                  #{activeBooking?.id || initialBooking?.id || "BK-CONFIRMED"}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-b border-gray-100 pb-2 dark:border-steel-800">
                <span className="text-gray-500">Timestamp:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {new Date().toLocaleString("en-IN")}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-b border-gray-100 pb-2 dark:border-steel-800">
                <span className="text-gray-500">Payment Channel:</span>
                <span className="font-bold uppercase text-gray-900 dark:text-white">
                  UPI Instant Escrow
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-gray-500">Escrow Safeguard:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  Protected (Safe Settlement)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {(activeBooking || initialBooking) && (
                <Button
                  size="md"
                  variant="primary"
                  id="continue-to-order-btn"
                  onClick={() => {
                    stopPolling();
                    onClose();
                    navigate(`/app/orders/${activeBooking?.id || initialBooking?.id}`);
                  }}
                  className="bg-[#164b2d] hover:bg-[#123e25] text-white px-5"
                >
                  Continue to Order →
                </Button>
              )}
              <Button size="md" variant="outline" onClick={downloadReceipt} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? "Generating PDF…" : "Download Receipt (PDF)"}
              </Button>
              <Button
                size="md"
                variant="outline"
                onClick={() => {
                  stopPolling();
                  onClose();
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* State 4: Payment Cancelled or Declined */}
        {step === "failed" && (
          <div className="space-y-6 py-6 text-center max-w-lg mx-auto">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div>
              <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                Payment Not Completed
              </span>
              <h3 className="mt-2 font-archivo text-2xl font-bold text-gray-900 dark:text-white">
                Payment Cancelled or Declined
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {errorMessage || "The payment authorization was cancelled or expired on your mobile device. No funds were debited."}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                size="md"
                variant="primary"
                id="retry-payment-btn"
                onClick={() => void initializePaymentSession()}
                className="bg-[#164b2d] text-white"
              >
                Retry Payment
              </Button>
              <Button
                size="md"
                variant="outline"
                onClick={() => {
                  stopPolling();
                  onClose();
                }}
              >
                Cancel &amp; Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
