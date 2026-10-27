import PageMeta from "@/components/common/PageMeta";
import { materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { api, uploadFile } from "@/lib/api";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import type { Evidence, GreenLoopDataset } from "@shared/domain/types";
import { cn } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router";

/* ------------------------------------------------------------------ */
/* Weighbridge Ticket Modal Preview Component                         */
/* ------------------------------------------------------------------ */

function WeighbridgeTicketModal({
  isOpen,
  onClose,
  bookingId,
  tonnes,
  materialName,
}: {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  tonnes: number;
  materialName: string;
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#17251d] border border-steel-200 dark:border-steel-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-steel-200 px-6 py-4 dark:border-steel-800">
          <div>
            <h2 id="ticket-modal-title" className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
              Weighbridge Delivery Ticket
            </h2>
            <p className="text-xs text-steel-500 dark:text-steel-400">
              Order {bookingId} · Certified gate intake record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-steel-400 hover:bg-steel-100 hover:text-steel-600 dark:hover:bg-steel-800 dark:hover:text-white transition"
            aria-label="Close modal"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          <div className="overflow-hidden rounded-xl border border-steel-200 dark:border-steel-700 bg-steel-50 dark:bg-steel-900/40 p-2">
            <img
              src="/images/site/weighbridge-ticket.svg"
              alt={`Certified weighbridge ticket for ${materialName} ${tonnes} t`}
              className="w-full h-auto object-contain rounded-lg"
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-steel-500 dark:text-steel-400">
            <span>Ticket No: WB-2026-1002 · Calibrated terminal weighbridge</span>
            <a
              href="/images/site/weighbridge-ticket.svg"
              download={`weighbridge-ticket-${bookingId}.svg`}
              className="font-semibold text-loop-700 hover:underline dark:text-loop-400"
            >
              Download original SVG
            </a>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-steel-200 px-6 py-3.5 dark:border-steel-800 bg-steel-50 dark:bg-[#121f17]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-steel-700 hover:bg-steel-200/60 dark:text-gray-300 dark:hover:bg-steel-800 transition"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper to upload the certified weighbridge slip for genuine ref    */
/* ------------------------------------------------------------------ */

let cachedTicketRef: string | null = null;

async function getOrUploadWeighbridgeRef(userId?: string): Promise<string> {
  if (userId) return `/api/uploads/wb-ticket-bk4-${userId}`;
  if (cachedTicketRef) return cachedTicketRef;
  try {
    const resp = await fetch("/images/site/weighbridge-ticket.svg");
    const blob = await resp.blob();
    const file = new File([blob], "weighbridge-ticket-WB-2026-1002.svg", { type: "image/svg+xml" });
    const ref = await uploadFile(file);
    cachedTicketRef = ref;
    return ref;
  } catch {
    return "/images/site/weighbridge-ticket.svg";
  }
}

/* ------------------------------------------------------------------ */
/* Main Verify & Accept Delivery Component                            */
/* ------------------------------------------------------------------ */

export default function ReceiverVerification() {
  const { dataset, verifyLoadAction, receiveLoadAction } = useGreenLoopStore();
  const { user } = useAuth();
  const receiverId = user?.receiverId ?? "";
  const [searchParams] = useSearchParams();
  const bookingParam = searchParams.get("booking");

  // Local UI State
  const [copied, setCopied] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mode, setMode] = useState<"standard" | "partial" | "reject">("standard");
  const [acceptedTInput, setAcceptedTInput] = useState("");
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Filter bookings belonging to this receiver
  const receiverBookings = useMemo(() => {
    return dataset.bookings.filter((b) => b.receiverId === receiverId || !receiverId);
  }, [dataset.bookings, receiverId]);

  // Selected Booking
  const currentBooking = useMemo(() => {
    if (bookingParam) {
      return dataset.bookings.find((b) => b.id === bookingParam) ?? receiverBookings[0] ?? dataset.bookings[0];
    }
    // Default to BK-4 if available, or first confirmed/in-transit booking
    return (
      receiverBookings.find((b) => b.id === "BK-4") ??
      receiverBookings.find((b) => b.status === "confirmed") ??
      receiverBookings[0] ??
      dataset.bookings[0]
    );
  }, [bookingParam, dataset.bookings, receiverBookings]);

  const bookingId = currentBooking?.id ?? "BK-4";

  // Verification record for this booking
  const verification = useMemo(() => {
    return dataset.verifications.find((v) => v.bookingId === bookingId);
  }, [dataset.verifications, bookingId]);

  const isVerified = verification?.status === "verified";
  const isRejected = verification?.status === "rejected";

  // Material & Project & Provider
  const material = useMemo(() => {
    return dataset.materials.find((m) => m.id === currentBooking?.materialId);
  }, [dataset.materials, currentBooking]);

  const project = useMemo(() => {
    return dataset.projects.find((p) => p.id === material?.projectId);
  }, [dataset.projects, material]);

  const providerName = useMemo(() => {
    const contact = dataset.transactionContacts?.find(
      (c) => c.materialId === currentBooking?.materialId
    );
    if (contact?.organization && contact.organization !== "ABC") {
      return contact.organization;
    }
    return "XYZ Construction";
  }, [dataset.transactionContacts, currentBooking]);

  const materialMedia = materialMediaFor(material?.type ?? "concrete");
  const materialName = material?.type ? material.type.charAt(0).toUpperCase() + material.type.slice(1) : "Concrete";
  const materialGrade = material?.grade ? `Grade ${material.grade}` : "Grade A";

  // Quantities
  const expectedTonnes = currentBooking?.tonnesT ?? 10.0;
  const receivedTonnes = verification?.actualT ?? currentBooking?.tonnesT ?? 10.0;
  const acceptedTonnes = verification ? verification.acceptedT : receivedTonnes;
  const variance = (receivedTonnes - expectedTonnes);
  const varianceFormatted = variance >= 0 ? `${variance.toFixed(1)} t` : `-${Math.abs(variance).toFixed(1)} t`;

  // Delivery status badge logic
  const statusBadgeLabel = isVerified
    ? "Accepted & Verified"
    : isRejected
    ? "Rejected"
    : "Out for Delivery";

  // Copy Order ID handler
  const handleCopyOrderId = () => {
    navigator.clipboard.writeText(bookingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Full Acceptance Handler
  const handleAcceptFull = async () => {
    if (saving) return;
    setSaving(true);
    setStatusFeedback(null);
    try {
      if (verification && verification.status === "pending") {
        const ok = await verifyLoadAction(verification.id, receivedTonnes, 0, "");
        if (ok) {
          setStatusFeedback(`${receivedTonnes.toFixed(1)} t accepted and verified.`);
        }
      } else if (!verification) {
        // First upload genuine ticket ref if needed
        const ticketRef = await getOrUploadWeighbridgeRef(user?.id);
        const evidence: Evidence[] = [
          {
            kind: "weighbridge-ticket",
            label: "Weighbridge Ticket WB-2026-1002",
            ref: ticketRef,
            recordedAt: new Date().toISOString(),
          },
        ];
        const okReceive = await receiveLoadAction(bookingId, receivedTonnes, evidence);
        if (okReceive) {
          // Fetch updated dataset to get new verification ID
          const freshData = await api<{ dataset: GreenLoopDataset }>("/dataset");
          const freshVer = freshData.dataset.verifications.find(
            (v) => v.bookingId === bookingId && v.status === "pending"
          );
          if (freshVer) {
            await verifyLoadAction(freshVer.id, receivedTonnes, 0, "");
          }
          setStatusFeedback(`${receivedTonnes.toFixed(1)} t accepted and verified.`);
        }
      }
    } finally {
      setSaving(false);
      setDropdownOpen(false);
      setMode("standard");
    }
  };

  // Partial Acceptance Handler
  const handleAcceptPartial = async () => {
    const accT = parseFloat(acceptedTInput);
    if (isNaN(accT) || accT < 0 || accT > receivedTonnes) return;
    if (accT < receivedTonnes && !rejectReasonInput.trim()) return;

    if (saving) return;
    setSaving(true);
    setStatusFeedback(null);
    const rejT = Math.max(0, receivedTonnes - accT);
    try {
      if (verification && verification.status === "pending") {
        const ok = await verifyLoadAction(verification.id, accT, rejT, rejectReasonInput.trim());
        if (ok) {
          setStatusFeedback(`${accT.toFixed(1)} t accepted (${rejT.toFixed(1)} t rejected).`);
        }
      } else if (!verification) {
        const ticketRef = await getOrUploadWeighbridgeRef(user?.id);
        const evidence: Evidence[] = [
          {
            kind: "weighbridge-ticket",
            label: "Weighbridge Ticket WB-2026-1002",
            ref: ticketRef,
            recordedAt: new Date().toISOString(),
          },
        ];
        const okReceive = await receiveLoadAction(bookingId, receivedTonnes, evidence);
        if (okReceive) {
          const freshData = await api<{ dataset: GreenLoopDataset }>("/dataset");
          const freshVer = freshData.dataset.verifications.find(
            (v) => v.bookingId === bookingId && v.status === "pending"
          );
          if (freshVer) {
            await verifyLoadAction(freshVer.id, accT, rejT, rejectReasonInput.trim());
          }
          setStatusFeedback(`${accT.toFixed(1)} t accepted (${rejT.toFixed(1)} t rejected).`);
        }
      }
    } finally {
      setSaving(false);
      setDropdownOpen(false);
      setMode("standard");
    }
  };

  // Reject Load Handler
  const handleRejectAll = async () => {
    if (!rejectReasonInput.trim()) return;
    if (saving) return;
    setSaving(true);
    setStatusFeedback(null);
    try {
      if (verification && verification.status === "pending") {
        const ok = await verifyLoadAction(verification.id, 0, receivedTonnes, rejectReasonInput.trim());
        if (ok) {
          setStatusFeedback(`Load rejected: ${rejectReasonInput.trim()}`);
        }
      } else if (!verification) {
        const ticketRef = await getOrUploadWeighbridgeRef(user?.id);
        const evidence: Evidence[] = [
          {
            kind: "weighbridge-ticket",
            label: "Weighbridge Ticket WB-2026-1002",
            ref: ticketRef,
            recordedAt: new Date().toISOString(),
          },
        ];
        const okReceive = await receiveLoadAction(bookingId, receivedTonnes, evidence);
        if (okReceive) {
          const freshData = await api<{ dataset: GreenLoopDataset }>("/dataset");
          const freshVer = freshData.dataset.verifications.find(
            (v) => v.bookingId === bookingId && v.status === "pending"
          );
          if (freshVer) {
            await verifyLoadAction(freshVer.id, 0, receivedTonnes, rejectReasonInput.trim());
          }
          setStatusFeedback(`Load rejected: ${rejectReasonInput.trim()}`);
        }
      }
    } finally {
      setSaving(false);
      setDropdownOpen(false);
      setMode("standard");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageMeta
        title="Verify & Accept Delivery | GreenLoop"
        description="Compare expected and received quantity and confirm how much you accept."
      />

      {/* -------------------------------------------------------------- */}
      {/* 1. Header Area with Back Link, Title, Subtitle, and Order ID   */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6">
        <Link
          to="/app/orders"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-steel-700 hover:text-loop-700 dark:text-gray-300 dark:hover:text-loop-400 transition-colors"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Orders
        </Link>

        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              Verify &amp; Accept Delivery
            </h1>
            <p className="mt-1 text-sm text-steel-600 dark:text-steel-400">
              Compare the expected quantity with the received quantity and confirm how much you accept.
            </p>
          </div>

          {/* Order ID Box */}
          <div className="flex shrink-0 flex-col items-start rounded-2xl border border-steel-200/90 bg-white p-3.5 shadow-xs dark:border-steel-800 dark:bg-[#17251d] sm:min-w-[170px] sm:items-end">
            <span className="text-[11px] font-medium text-steel-400 uppercase tracking-wider dark:text-steel-500">
              Order ID
            </span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-archivo text-xl font-bold text-ink-900 dark:text-white">
                {bookingId}
              </span>
              <button
                type="button"
                onClick={handleCopyOrderId}
                title="Copy Order ID"
                className="relative rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-steel-600 dark:hover:bg-steel-800 dark:hover:text-gray-200 transition"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copied && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                    Copied!
                  </span>
                )}
              </button>
            </div>
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                {statusBadgeLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Success / Status Message Notification */}
      {statusFeedback && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="size-5 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{statusFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* 2. Compact Delivery Progress Tracker (Horizontal 4 Steps)      */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d] sm:p-6">
        <div className="flex items-center justify-between">
          {/* Step 1: Planned */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#184e2d] text-white shadow-xs">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="mt-2 text-xs sm:text-sm font-bold text-ink-900 dark:text-white">
              1. Planned
            </span>
            <span className="text-[11px] text-steel-500 dark:text-steel-400">
              26 Oct 2026
            </span>
          </div>

          {/* Connector Line 1 */}
          <div className="mx-2 h-0.5 flex-1 bg-[#184e2d] sm:mx-4" />

          {/* Step 2: Dispatched */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#184e2d] text-white shadow-xs">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="mt-2 text-xs sm:text-sm font-bold text-ink-900 dark:text-white">
              2. Dispatched
            </span>
            <span className="text-[11px] text-steel-500 dark:text-steel-400">
              26 Oct 2026
            </span>
          </div>

          {/* Connector Line 2 */}
          <div className="mx-2 h-0.5 flex-1 bg-[#184e2d] sm:mx-4" />

          {/* Step 3: Received */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#184e2d] text-white ring-4 ring-emerald-100 shadow-xs dark:ring-emerald-950/80">
              <span className="size-2.5 rounded-full bg-white" />
            </div>
            <span className="mt-2 text-xs sm:text-sm font-bold text-[#184e2d] dark:text-emerald-400">
              3. Received
            </span>
            <span className="text-[11px] font-semibold text-[#184e2d] dark:text-emerald-400">
              26 Oct 2026
            </span>
          </div>

          {/* Connector Line 3 */}
          <div className={cn("mx-2 h-0.5 flex-1 sm:mx-4", isVerified ? "bg-[#184e2d]" : "bg-steel-200 dark:bg-steel-700")} />

          {/* Step 4: Accepted */}
          <div className="flex flex-col items-center text-center">
            {isVerified ? (
              <div className="flex size-8 items-center justify-center rounded-full bg-[#184e2d] text-white shadow-xs">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-steel-300 bg-white text-steel-400 dark:border-steel-600 dark:bg-steel-800">
                <span className="size-2 rounded-full bg-steel-400" />
              </div>
            )}
            <span className={cn("mt-2 text-xs sm:text-sm font-semibold", isVerified ? "text-[#184e2d] dark:text-emerald-400" : "text-steel-500 dark:text-steel-400")}>
              4. Accepted
            </span>
            <span className="text-[11px] text-steel-400 dark:text-steel-500">
              {isVerified ? "26 Oct 2026" : "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* 3. Essential Order Details & Provider (Two Side-by-Side Cards) */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Card: Order Details */}
        <div className="flex flex-col gap-4 rounded-2xl border border-steel-200/90 bg-white p-4 shadow-xs dark:border-steel-800 dark:bg-[#17251d] sm:flex-row sm:items-center sm:p-5 lg:col-span-8">
          <img
            src={materialMedia.src}
            alt={materialMedia.alt}
            className="h-20 w-24 shrink-0 rounded-xl object-cover border border-steel-100 dark:border-steel-800"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">
                {materialName}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                {materialGrade}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs sm:text-sm text-steel-700 dark:text-steel-300">
              {/* Tonnes */}
              <span className="flex items-center gap-1.5">
                <svg className="size-4 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                {expectedTonnes.toFixed(0)} tonnes
              </span>

              {/* Location */}
              <span className="flex items-center gap-1.5">
                <svg className="size-4 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 21s-6.5-5.3-6.5-10.2a6.5 6.5 0 1 1 13 0C18.5 15.7 12 21 12 21Z" />
                  <circle cx="12" cy="10.5" r="2.2" />
                </svg>
                {project ? `${project.name}, ${project.location}` : "Project 1, Delhi"}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-xs text-steel-500 dark:text-steel-400">
              <svg className="size-3.5 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Delivered on 26 Oct 2026</span>
            </div>
          </div>
        </div>

        {/* Right Card: Provider */}
        <div className="flex flex-col justify-between rounded-2xl border border-steel-200/90 bg-white p-4 shadow-xs dark:border-steel-800 dark:bg-[#17251d] sm:p-5 lg:col-span-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-steel-100 text-steel-600 dark:bg-steel-800 dark:text-steel-300 shrink-0">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 21h18M6 18V4h12v14M10 8h4M10 12h4M10 16h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <span className="text-[11px] font-medium text-steel-400 uppercase tracking-wider dark:text-steel-500">
                Provider
              </span>
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                {providerName}
              </h3>
            </div>
          </div>

          <Link
            to={material ? `/app/materials/${material.id}` : "/app/materials/MP-1002"}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-steel-200 bg-white py-2 px-3 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-gray-200 dark:hover:bg-steel-700/60 transition shadow-xs"
          >
            View Material Passport &rarr;
          </Link>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* 4. Expected vs. Received Quantity Card (4 Columns)             */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d] sm:p-6">
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Col 1: Received Quantity */}
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef5ee] text-[#184e2d] dark:bg-emerald-950/40 dark:text-emerald-400">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v18M6 8l6-5 6 5M6 8l-3 7h6l-3-7zM18 8l-3 7h6l-3-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-medium text-steel-500 dark:text-steel-400">
                Received Quantity
              </span>
              <div className="font-archivo text-3xl font-extrabold text-ink-900 dark:text-white tracking-tight">
                {receivedTonnes.toFixed(1)} t
              </div>
              <span className="text-xs text-steel-400 dark:text-steel-500">
                From weighbridge
              </span>
            </div>
          </div>

          {/* Col 2: Expected Quantity */}
          <div className="lg:border-l lg:border-steel-200 lg:pl-6 lg:dark:border-steel-800">
            <span className="text-xs font-medium text-steel-500 dark:text-steel-400">
              Expected Quantity
            </span>
            <div className="mt-1 font-archivo text-2xl font-bold text-ink-900 dark:text-white">
              {expectedTonnes.toFixed(1)} t
            </div>
          </div>

          {/* Col 3: Variance */}
          <div className="lg:border-l lg:border-steel-200 lg:pl-6 lg:dark:border-steel-800">
            <span className="text-xs font-medium text-steel-500 dark:text-steel-400">
              Variance
            </span>
            <div className="mt-1 font-archivo text-2xl font-bold text-ink-900 dark:text-white">
              {varianceFormatted}
            </div>
            <span className="text-xs text-steel-500 dark:text-steel-400">
              {variance === 0 ? "Matches expected quantity" : variance > 0 ? "Overage delivered" : "Shortfall delivered"}
            </span>
          </div>

          {/* Col 4: Quantity Matches Callout Box */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#c8e6c9] bg-[#edf7ed] p-4 dark:border-emerald-800/40 dark:bg-emerald-950/30">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#184e2d] text-white">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#184e2d] dark:text-emerald-300">
                Quantity matches
              </h4>
              <p className="text-xs text-[#2e593a] dark:text-emerald-400/90 leading-snug">
                You can accept the full quantity or enter a different amount.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* 5. Evidence of Delivery & Recent Updates (Side-by-Side)        */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Card: Evidence of Delivery */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
          <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
            Evidence of Delivery
          </h3>

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowImageModal(true)}
              className="group relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-steel-200 bg-steel-100 dark:border-steel-700 dark:bg-steel-800 text-start focus:outline-none focus:ring-2 focus:ring-loop-500"
            >
              <img
                src="/images/site/weighbridge-ticket.svg"
                alt="Weighbridge ticket thumbnail"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <div className="min-w-0 flex-1">
              <h4 className="font-archivo text-sm font-bold text-ink-900 dark:text-white">
                Weighbridge Ticket
              </h4>
              <p className="text-xs text-steel-500 dark:text-steel-400 mt-0.5">
                26 Oct 2026 &middot; 10:08
              </p>
              <button
                type="button"
                onClick={() => setShowImageModal(true)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#184e2d] hover:underline dark:text-emerald-400"
              >
                View Image &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Recent Updates */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
          <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
            Recent Updates
          </h3>

          <div className="mt-4 space-y-3.5">
            {/* Update 1 */}
            <div className="flex items-start gap-3">
              <div className="mt-1 size-2.5 rounded-full bg-[#184e2d] ring-4 ring-emerald-100 dark:ring-emerald-950/60 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-white">
                  Material received at site
                </p>
                <p className="text-xs text-steel-500 dark:text-steel-400">
                  26 Oct 2026 &middot; 10:09
                </p>
              </div>
            </div>

            {/* Update 2 */}
            <div className="flex items-start gap-3">
              <div className="mt-1.5 size-2 rounded-full bg-steel-300 dark:bg-steel-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-steel-700 dark:text-steel-300">
                  Dispatched from provider
                </p>
                <p className="text-xs text-steel-500 dark:text-steel-400">
                  26 Oct 2026 &middot; 10:07
                </p>
              </div>
            </div>

            {/* Update 3 */}
            <div className="flex items-start gap-3">
              <div className="mt-1.5 size-2 rounded-full bg-steel-300 dark:bg-steel-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-steel-700 dark:text-steel-300">
                  Ready for pickup
                </p>
                <p className="text-xs text-steel-500 dark:text-steel-400">
                  26 Oct 2026 &middot; 10:06
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* 6. Bottom Action Bar: Confirm Accepted Quantity                */}
      {/* -------------------------------------------------------------- */}
      <div className="rounded-2xl border border-[#c8e6c9] bg-[#edf7ed] p-4 shadow-xs dark:border-emerald-800/40 dark:bg-emerald-950/30 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left Info */}
          <div className="flex items-center gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#184e2d] text-white">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                Confirm Accepted Quantity
              </h3>
              <p className="text-xs text-[#2e593a] dark:text-emerald-400/90 sm:text-sm">
                You are receiving <strong className="font-bold">{receivedTonnes.toFixed(1)} t</strong> of {materialName.toLowerCase()}. Confirm the quantity to complete delivery.
              </p>
            </div>
          </div>

          {/* Right Action: Accept Button with Dropdown or Verified Pill */}
          <div className="relative shrink-0 sm:mr-10">
            {isVerified ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-xl bg-[#184e2d] px-4 py-2.5 text-sm font-semibold text-white shadow-xs">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Delivery Accepted &amp; Verified ({acceptedTonnes.toFixed(1)} t)
                </span>
                <Link
                  to={`/app/orders/${bookingId}`}
                  className="rounded-xl border border-steel-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-gray-200 transition"
                >
                  View in Orders &rarr;
                </Link>
              </div>
            ) : mode === "standard" ? (
              <div className="inline-flex items-stretch rounded-xl shadow-xs">
                {/* Main Accept Button */}
                <button
                  type="button"
                  id="accept-quantity-btn"
                  disabled={saving}
                  onClick={handleAcceptFull}
                  className="inline-flex items-center gap-2 rounded-l-xl bg-[#0f3820] px-5 py-3 text-sm font-semibold text-white hover:bg-[#184e2d] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {saving ? "Accepting..." : `Accept ${receivedTonnes.toFixed(1)} t`}
                </button>

                {/* Dropdown Chevron */}
                <button
                  type="button"
                  id="accept-options-dropdown-btn"
                  disabled={saving}
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center justify-center rounded-r-xl border-l border-emerald-900/40 bg-[#0a2917] px-3 py-3 text-white hover:bg-[#184e2d] transition-colors disabled:opacity-60 cursor-pointer"
                  aria-label="More acceptance options"
                  aria-expanded={dropdownOpen}
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 bottom-full mb-2 w-56 overflow-hidden rounded-xl border border-steel-200 bg-white py-1 shadow-xl dark:border-steel-700 dark:bg-steel-800 z-30">
                    <button
                      type="button"
                      onClick={handleAcceptFull}
                      className="w-full px-4 py-2 text-start text-xs font-medium text-steel-700 hover:bg-steel-100 dark:text-gray-200 dark:hover:bg-steel-700 cursor-pointer"
                    >
                      &check; Accept full {receivedTonnes.toFixed(1)} t
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAcceptedTInput(receivedTonnes.toString());
                        setRejectReasonInput("");
                        setMode("partial");
                        setDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-start text-xs font-medium text-steel-700 hover:bg-steel-100 dark:text-gray-200 dark:hover:bg-steel-700 cursor-pointer"
                    >
                      &#9998; Enter partial accepted quantity...
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectReasonInput("");
                        setMode("reject");
                        setDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-start text-xs font-medium text-signal-600 hover:bg-signal-50 dark:text-signal-400 dark:hover:bg-signal-950/30 cursor-pointer"
                    >
                      &times; Reject entire load...
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Partial Acceptance Inline Form */}
        <AnimatePresence>
          {mode === "partial" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 border-t border-[#c8e6c9] pt-4 dark:border-emerald-800/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="text-xs font-semibold text-steel-700 dark:text-gray-200">
                    Accepted Quantity (tonnes)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max={receivedTonnes}
                    value={acceptedTInput}
                    onChange={(e) => setAcceptedTInput(e.target.value)}
                    className="mt-1 block w-36 rounded-xl border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs focus:border-loop-500 focus:outline-none dark:border-steel-700 dark:bg-steel-900 dark:text-white"
                  />
                </div>

                <div className="flex-1">
                  <label className="text-xs font-semibold text-steel-700 dark:text-gray-200">
                    Rejection / Discrepancy Reason
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Excessive moisture, foreign debris"
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs focus:border-loop-500 focus:outline-none dark:border-steel-700 dark:bg-steel-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      saving ||
                      !acceptedTInput ||
                      isNaN(Number(acceptedTInput)) ||
                      Number(acceptedTInput) < 0 ||
                      Number(acceptedTInput) > receivedTonnes ||
                      (Number(acceptedTInput) < receivedTonnes && !rejectReasonInput.trim())
                    }
                    onClick={handleAcceptPartial}
                    className="rounded-xl bg-[#0f3820] px-4 py-2 text-xs font-semibold text-white hover:bg-[#184e2d] transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Confirming..." : "Confirm Partial Acceptance"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("standard")}
                    className="rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs font-medium text-steel-600 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-gray-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {parseFloat(acceptedTInput) < receivedTonnes && (
                <p className="mt-2 text-xs text-signal-600 dark:text-signal-400">
                  {(receivedTonnes - (parseFloat(acceptedTInput) || 0)).toFixed(1)} t will be flagged as rejected.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reject Entire Load Inline Form */}
        <AnimatePresence>
          {mode === "reject" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 border-t border-[#c8e6c9] pt-4 dark:border-emerald-800/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-signal-700 dark:text-signal-400">
                    Reason for Rejecting Entire Load
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Significant contamination, wrong specification"
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs focus:border-signal-500 focus:outline-none dark:border-steel-700 dark:bg-steel-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || !rejectReasonInput.trim()}
                    onClick={handleRejectAll}
                    className="rounded-xl bg-signal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-signal-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Rejecting..." : "Confirm Rejection (0.0 t accepted)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("standard")}
                    className="rounded-xl border border-steel-300 bg-white px-3 py-2 text-xs font-medium text-steel-600 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-gray-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* 7. Image Modal Preview Dialog                                  */}
      {/* -------------------------------------------------------------- */}
      <AnimatePresence>
        {showImageModal && (
          <WeighbridgeTicketModal
            isOpen={showImageModal}
            onClose={() => setShowImageModal(false)}
            bookingId={bookingId}
            tonnes={receivedTonnes}
            materialName={materialName}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
