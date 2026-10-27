import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import type { MaterialPassport, Project } from "@shared/domain/types";
import { computeMaterialLedger, computeMatch } from "@shared/domain/capacity";
import { calculateLandedCost } from "@shared/domain/landedCost";
import { materialMediaFor } from "@/config/appMedia";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import { formatDate, formatINRPerT, materialTypeLabel } from "@/utils";
import LandedCostCard from "@/components/greenloop/LandedCostCard";
import { Modal } from "@/components/ui/modal";

const COMMERCIAL_STIPULATIONS = [
  "Payment: 30 days net",
  "NABL certified lab report required",
  "Staged dispatch across 2 weeks",
  "Moisture content < 5%",
  "Weighbridge slip on delivery",
];

interface MaterialPassportDrawerProps {
  material: MaterialPassport | null;
  project?: Project;
  isOpen: boolean;
  onClose: () => void;
  onAllocate?: (material: MaterialPassport) => void;
  mode?: "provider" | "receiver";
  onRequestMaterial?: (material: MaterialPassport) => void;
  onNegotiateTerms?: (material: MaterialPassport) => void;
}

export default function MaterialPassportDrawer({
  material,
  project,
  isOpen,
  onClose,
  onAllocate,
  mode = "provider",
  onRequestMaterial,
  onNegotiateTerms,
}: MaterialPassportDrawerProps) {
  const { dataset, deleteMaterialAction, updateMaterialAction, setMaterialListingStatusAction, addDemandAction } = useGreenLoopStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Accordion open/closed state (Key Information open by default)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    keyInfo: true,
    specifications: false,
    evidence: false,
    availability: false,
    matchingCost: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Context menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  // Close drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Delete & Edit states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editCondition, setEditCondition] = useState<"good" | "fair" | "poor">("good");
  const [editGrade, setEditGrade] = useState<"A" | "B" | "C">("A");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Commercial Terms Negotiation state
  const [showNegotiateModal, setShowNegotiateModal] = useState(false);
  const [negotiateQuantity, setNegotiateQuantity] = useState<string>("");
  const [negotiatePrice, setNegotiatePrice] = useState<string>("");
  const [negotiateDate, setNegotiateDate] = useState<string>("");
  const [negotiateDestination, setNegotiateDestination] = useState<string>("");
  const [negotiateNotes, setNegotiateNotes] = useState<string>("");
  const [isSubmittingNegotiation, setIsSubmittingNegotiation] = useState(false);
  const [negotiationSuccess, setNegotiationSuccess] = useState<{ demandId: string } | null>(null);
  const [negotiationError, setNegotiationError] = useState("");

  useEffect(() => {
    if (material) {
      setEditPrice(material.pricePerT !== undefined && material.pricePerT !== null ? String(material.pricePerT) : "");
      setEditCondition(material.condition);
      setEditGrade(material.grade);
      setEditNotes(material.surveyNotes || "");

      // Initialize negotiation terms default values
      setNegotiateQuantity(String(material.quantityT || ""));
      setNegotiatePrice(material.pricePerT !== undefined && material.pricePerT !== null ? String(material.pricePerT) : "");
      const defaultDate = material.availableFrom && material.availableFrom > new Date().toISOString().slice(0, 10)
        ? material.availableFrom
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + 14);
            return d.toISOString().slice(0, 10);
          })();
      setNegotiateDate(defaultDate);
      setNegotiateDestination(user?.location || user?.organization || "Receiving Yard · Delhi NCR");
      setNegotiateNotes("");
      setNegotiationSuccess(null);
      setNegotiationError("");
    }
  }, [material, user]);

  const toggleStipulation = (stip: string) => {
    if (negotiateNotes.includes(stip)) {
      setNegotiateNotes((prev) => prev.replace(stip, "").replace(/\n\n+/g, "\n").trim());
    } else {
      setNegotiateNotes((prev) => (prev ? `${prev.trim()}\n• ${stip}` : `• ${stip}`));
    }
  };

  const handleNegotiateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    const qty = parseFloat(negotiateQuantity);
    const price = parseFloat(negotiatePrice);
    if (!qty || qty <= 0) {
      setNegotiationError("Please enter a valid target quantity.");
      return;
    }
    if (isNaN(price) || price < 0) {
      setNegotiationError("Please enter a valid target price.");
      return;
    }
    if (!negotiateDestination.trim()) {
      setNegotiationError("Please specify a receiving destination.");
      return;
    }

    setIsSubmittingNegotiation(true);
    setNegotiationError("");
    try {
      const demand = await addDemandAction({
        receiverId: user?.receiverId,
        materialType: material.type,
        requiredT: qty,
        budgetPerT: price,
        period: negotiateDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        location: negotiateDestination.trim(),
        notes: [
          `[Commercial Terms Proposal for ${material.id}]`,
          negotiatePrice ? `Target Price: ₹${price.toLocaleString("en-IN")}/tonne` : "",
          negotiateNotes.trim(),
        ].filter(Boolean).join("\n"),
        targetMaterialId: material.id,
      });

      if (demand) {
        setNegotiationSuccess({ demandId: demand.id });
      } else {
        setNegotiationError("Unable to submit proposal. Please try again.");
      }
    } catch (err: unknown) {
      setNegotiationError(err instanceof Error ? err.message : "Failed to submit proposal");
    } finally {
      setIsSubmittingNegotiation(false);
    }
  };

  if (!material) return null;

  const resolvedProject = project || dataset.projects.find((p) => p.id === material.projectId);
  const ledger = computeMaterialLedger(material, dataset.bookings, 0, dataset.verifications);
  const mediaList = materialMedia(material);
  const primaryPhoto = mediaList[0] || materialMediaFor(material.type);

  // Active bookings for this material
  const activeBookings = dataset.bookings.filter(
    (b) => b.materialId === material.id && b.status !== "cancelled"
  );
  const relatedOffer = (dataset.offers ?? []).find(
    (offer) => offer.passportId === material.id && offer.status !== "declined"
  );
  const transactionPricePerT = activeBookings[0]?.agreedPricePerT ?? relatedOffer?.agreedPricePerT ?? relatedOffer?.pricePerT;

  const receiverAllocation = dataset.allocations.find(
    (a) => a.materialId === material.id && a.status !== "cancelled"
  );
  const receiverFacility = receiverAllocation
    ? dataset.receivers.find((r) => r.id === receiverAllocation.receiverId)
    : null;

  const landedCostCalc = calculateLandedCost({
    materialType: material.type,
    quantityT: material.quantityT,
    pricePerT: transactionPricePerT ?? material.pricePerT,
    distanceKm: receiverFacility?.distanceKm,
    distanceKnown: receiverFacility?.distanceKnown,
    materialId: material.id,
    destination: receiverFacility?.location,
  });

  const candidateMatches = computeMatch(dataset, material.id, new Date().toISOString().slice(0, 10)).slice(0, 3);

  const isVerified = material.status === "verified" || material.verificationStatus === "verified";
  const isRejected = material.verificationStatus === "rejected";

  const handleDelete = async () => {
    if (activeBookings.length > 0) {
      setDeleteError("Cannot delete material with confirmed active commitments or deliveries.");
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    try {
      const ok = await deleteMaterialAction(material.id);
      if (ok) {
        setShowDeleteModal(false);
        onClose();
      } else {
        setDeleteError("Failed to delete material passport.");
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error deleting material.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);
    try {
      const ok = await updateMaterialAction(material.id, {
        type: material.type,
        quantityT: material.quantityT,
        availableFrom: material.availableFrom ?? null,
        pricePerT: editPrice.trim() === "" ? null : Number(editPrice),
        condition: editCondition,
        grade: editGrade,
        surveyNotes: editNotes.trim(),
      });
      if (ok) {
        setShowEditModal(false);
      }
    } catch {
      // Ignored
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleStatusChange = async (status: "draft" | "published" | "paused" | "archived") => {
    setMenuOpen(false);
    await setMaterialListingStatusAction(material.id, status);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop on mobile / small screens */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
            aria-hidden="true"
          />

          {/* Right-Side Drawer */}
          <motion.aside
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            aria-label="Material Passport"
            className="fixed top-0 lg:top-16 bottom-0 right-0 z-40 flex w-full flex-col border-s border-steel-200 bg-white shadow-2xl dark:border-steel-800 dark:bg-[#17251d] sm:max-w-[480px] lg:max-w-[500px] xl:max-w-[520px]"
          >
            {/* Drawer Top Bar */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-steel-200 px-5 dark:border-steel-800 sm:px-6">
              <h2 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
                Material Passport
              </h2>

              <div className="flex items-center gap-2">
                {/* Contextual Three-Dots Menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="flex size-8 items-center justify-center rounded-lg text-steel-500 hover:bg-steel-100 hover:text-ink-900 dark:text-steel-400 dark:hover:bg-steel-800 dark:hover:text-white"
                    title="Passport Options"
                    aria-label="Passport Options"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.75" />
                      <circle cx="12" cy="12" r="1.75" />
                      <circle cx="12" cy="19" r="1.75" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-steel-200 bg-white py-1.5 shadow-xl dark:border-steel-700 dark:bg-[#1b2b22]">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowEditModal(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        <span>Edit Passport</span>
                      </button>

                      {onAllocate && ledger.availableT > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onAllocate(material);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-[#164b2d] hover:bg-[#edf5ef] dark:text-[#00e599] dark:hover:bg-steel-800/60"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                          <span>Allocate Surplus</span>
                        </button>
                      )}

                      <Link
                        to={`/app/market-demand?view=receivers&materialId=${encodeURIComponent(material.id)}&type=${encodeURIComponent(material.type)}`}
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        <span>Find Receivers</span>
                      </Link>

                      <Link
                        to={`/app/auctions?material=${encodeURIComponent(material.id)}`}
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" /><path d="m16 16 6-6" /><path d="m8 8 6-6" /><path d="m9 7 8 8" /><path d="m21 11-8-8" /></svg>
                        <span>Create Auction</span>
                      </Link>

                      <div className="my-1 border-t border-steel-100 dark:border-steel-700/60" />

                      {/* Listing Lifecycle */}
                      {material.listingStatus === "published" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange("paused")}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-steel-800/60"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                          <span>Pause Listing</span>
                        </button>
                      )}

                      {material.listingStatus === "paused" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange("published")}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-steel-800/60"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          <span>Relist Published</span>
                        </button>
                      )}

                      {material.listingStatus !== "archived" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange("archived")}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-steel-600 hover:bg-steel-50 dark:text-steel-300 dark:hover:bg-steel-800/60"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>
                          <span>Archive Listing</span>
                        </button>
                      )}

                      <div className="my-1 border-t border-steel-100 dark:border-steel-700/60" />

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowDeleteModal(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-steel-800/60"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        <span>Delete Passport</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-lg text-steel-500 hover:bg-steel-100 hover:text-ink-900 dark:text-steel-400 dark:hover:bg-steel-800 dark:hover:text-white"
                  title="Close Passport"
                  aria-label="Close Passport"
                >
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Independent Scroll Area */}
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5">
              {/* Profile Card Header (Matching Reference) */}
              <div className="flex items-start gap-4">
                <div className="size-28 sm:size-32 shrink-0 overflow-hidden rounded-2xl border border-steel-200 bg-steel-100 dark:border-steel-700 dark:bg-steel-800 shadow-2xs">
                  <img
                    src={primaryPhoto.src}
                    alt={primaryPhoto.caption || material.name || materialTypeLabel(material.type)}
                    className="size-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-md bg-steel-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                    {material.id}
                  </span>

                  <h3 className="mt-1 font-archivo text-xl font-bold leading-snug text-ink-900 dark:text-white truncate">
                    {material.name || materialTypeLabel(material.type)}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                        Verified
                      </span>
                    ) : isRejected ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                        <span className="size-1.5 rounded-full bg-red-600" />
                        Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        <span className="size-1.5 rounded-full bg-amber-600" />
                        Unverified
                      </span>
                    )}

                    <span className="rounded-full bg-steel-100 px-2.5 py-0.5 text-xs font-medium text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                      Grade {material.grade}
                    </span>
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-xs text-steel-500 dark:text-steel-400 truncate">
                    <svg className="size-3.5 shrink-0 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="truncate">{resolvedProject?.name || "Project site"} · {resolvedProject?.location || "Delhi"}</span>
                  </p>
                </div>
              </div>

              {/* Metric Highlights (Matching Reference) */}
              {mode === "receiver" ? (
                /* 3-Column Metric Highlights for Receiver */
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="flex flex-col rounded-2xl border border-steel-200/80 bg-steel-50/60 p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-steel-700 shadow-2xs dark:bg-steel-800 dark:text-steel-200 mb-1.5">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
                        <path d="m3.27 6.96 8.73 4.88 8.73-4.88" />
                        <path d="M12 22.08V12" />
                      </svg>
                    </div>
                    <p className="font-archivo text-xs sm:text-sm font-bold text-ink-900 dark:text-white truncate">
                      {ledger.availableT.toFixed(ledger.availableT % 1 === 0 ? 0 : 1)} tonnes
                    </p>
                    <p className="text-[10px] text-steel-500 dark:text-steel-400">Available</p>
                  </div>

                  <div className="flex flex-col rounded-2xl border border-steel-200/80 bg-steel-50/60 p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-steel-700 shadow-2xs dark:bg-steel-800 dark:text-steel-200 mb-1.5">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                    </div>
                    <p className="font-archivo text-xs sm:text-sm font-bold text-ink-900 dark:text-white truncate">
                      {material.availableFrom ? formatDate(material.availableFrom) : "Ready now"}
                    </p>
                    <p className="text-[10px] text-steel-500 dark:text-steel-400">Available from</p>
                  </div>

                  <div className="flex flex-col rounded-2xl border border-steel-200/80 bg-steel-50/60 p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-steel-700 shadow-2xs dark:bg-steel-800 dark:text-steel-200 mb-1.5 font-bold font-archivo text-xs">
                      ₹
                    </div>
                    <p className="font-archivo text-xs sm:text-sm font-bold text-ink-900 dark:text-white truncate">
                      {material.pricePerT !== undefined && material.pricePerT !== null && Number(material.pricePerT) > 0
                        ? formatINRPerT(material.pricePerT)
                        : "Price on request"}
                    </p>
                    <p className="text-[10px] text-steel-500 dark:text-steel-400">Ex-works price</p>
                  </div>
                </div>
              ) : (
                /* 2-Column Metric Highlights for Provider */
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-steel-200/80 bg-steel-50/60 p-3.5 dark:border-steel-800 dark:bg-white/[0.02]">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-steel-700 shadow-2xs dark:bg-steel-800 dark:text-steel-200">
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
                        <path d="m3.27 6.96 8.73 4.88 8.73-4.88" />
                        <path d="M12 22.08V12" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-archivo text-xs sm:text-sm font-bold text-ink-900 dark:text-white truncate">
                        {ledger.availableT.toFixed(1)} tonnes available
                      </p>
                      <p className="text-[11px] text-steel-500 dark:text-steel-400 truncate">
                        From {resolvedProject?.name || "demolition project"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-steel-200/80 bg-steel-50/60 p-3.5 dark:border-steel-800 dark:bg-white/[0.02]">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-steel-700 shadow-2xs dark:bg-steel-800 dark:text-steel-200">
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-archivo text-xs sm:text-sm font-bold text-ink-900 dark:text-white truncate">
                        {material.availableFrom ? `Available ${formatDate(material.availableFrom)}` : "Available now"}
                      </p>
                      <p className="text-[11px] text-steel-500 dark:text-steel-400 truncate">
                        Listed {formatDate(material.surveyedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Call to Action Button Row */}
              {mode === "receiver" ? (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const activeBooking = activeBookings.find((b) => b.status !== "cancelled");
                    const existingDemand = (dataset.demands ?? []).find(
                      (d) => d.targetMaterialId === material.id && d.receiverId === user?.receiverId && d.status !== "CANCELLED"
                    );

                    if (activeBooking) {
                      return (
                        <Link
                          to={`/app/orders/${activeBooking.id}`}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-700"
                        >
                          <span>View Order #{activeBooking.id.slice(0, 8)}</span>
                          <span>→</span>
                        </Link>
                      );
                    }

                    if (relatedOffer) {
                      return (
                        <Link
                          to={`/app/negotiations/${relatedOffer.id}`}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#164b2d] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#1e5836]"
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
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-steel-300 bg-white px-5 py-3 text-sm font-semibold text-steel-800 shadow-sm transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-200"
                        >
                          <span>View Existing Request</span>
                          <span>→</span>
                        </Link>
                      );
                    }

                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => onRequestMaterial?.(material)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#164b2d] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#1e5836] dark:hover:bg-[#2a7347]"
                        >
                          <span>Request Material</span>
                        </button>

                        <button
                          type="button"
                          id="drawer-negotiate-terms-btn"
                          onClick={() => {
                            if (onNegotiateTerms) {
                              onNegotiateTerms(material);
                            } else {
                              setShowNegotiateModal(true);
                            }
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-steel-300 bg-white px-5 py-2.5 text-xs font-semibold text-steel-800 shadow-2xs transition hover:border-steel-400 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-200 dark:hover:bg-white/5"
                        >
                          <svg
                            className="size-4 text-[#164b2d] dark:text-[#8fe0a4]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>Negotiate Terms</span>
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/app/market-demand?view=receivers&materialId=${encodeURIComponent(material.id)}&type=${encodeURIComponent(material.type)}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#164b2d] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#1e5836] dark:hover:bg-[#2a7347]"
                  >
                    <span>Find a Receiver</span>
                    <span aria-hidden="true">→</span>
                  </Link>

                  {onAllocate && ledger.availableT > 0 && (
                    <button
                      type="button"
                      onClick={() => onAllocate(material)}
                      className="flex size-11 items-center justify-center rounded-xl border border-steel-200 bg-white text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#1a2b21] dark:text-steel-200 dark:hover:bg-steel-800 transition"
                      title="Allocate Surplus Material"
                      aria-label="Allocate Surplus Material"
                    >
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Navigation Anchor Tabs */}
              <div className="flex items-center gap-3 overflow-x-auto border-b border-steel-200 pb-2 text-xs font-semibold text-steel-500 dark:border-steel-800 dark:text-steel-400 no-scrollbar">
                <button
                  type="button"
                  onClick={() => toggleSection("keyInfo")}
                  className={`pb-1 transition whitespace-nowrap ${openSections.keyInfo ? "border-b-2 border-emerald-700 text-emerald-800 font-bold dark:border-emerald-400 dark:text-emerald-300" : "hover:text-ink-900 dark:hover:text-white"}`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection("specifications")}
                  className={`pb-1 transition whitespace-nowrap ${openSections.specifications ? "border-b-2 border-emerald-700 text-emerald-800 font-bold dark:border-emerald-400 dark:text-emerald-300" : "hover:text-ink-900 dark:hover:text-white"}`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection("evidence")}
                  className={`pb-1 transition whitespace-nowrap ${openSections.evidence ? "border-b-2 border-emerald-700 text-emerald-800 font-bold dark:border-emerald-400 dark:text-emerald-300" : "hover:text-ink-900 dark:hover:text-white"}`}
                >
                  Evidence
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection("availability")}
                  className={`pb-1 transition whitespace-nowrap ${openSections.availability ? "border-b-2 border-emerald-700 text-emerald-800 font-bold dark:border-emerald-400 dark:text-emerald-300" : "hover:text-ink-900 dark:hover:text-white"}`}
                >
                  Availability
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection("matchingCost")}
                  className={`pb-1 transition whitespace-nowrap ${openSections.matchingCost ? "border-b-2 border-emerald-700 text-emerald-800 font-bold dark:border-emerald-400 dark:text-emerald-300" : "hover:text-ink-900 dark:hover:text-white"}`}
                >
                  {mode === "receiver" ? "Landed Cost" : "Matching & Cost"}
                </button>
              </div>

              {/* 1. Key Information Accordion (Expanded by default) */}
              <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden dark:border-steel-800 dark:bg-[#1a2b21]/40">
                <button
                  type="button"
                  onClick={() => toggleSection("keyInfo")}
                  className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
                >
                  <span>Key Information</span>
                  <svg className={`size-4 text-steel-400 transition-transform duration-200 ${openSections.keyInfo ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openSections.keyInfo && (
                  <div className="border-t border-steel-100 px-4 py-3 dark:border-steel-800/80 text-xs">
                    <dl className="grid grid-cols-2 gap-y-2.5 sm:grid-cols-[130px_1fr]">
                      <dt className="text-steel-500 dark:text-steel-400">Material type</dt>
                      <dd className="font-semibold text-ink-900 dark:text-white capitalize">{materialTypeLabel(material.type)}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Condition</dt>
                      <dd className="font-semibold text-ink-900 dark:text-white capitalize">{material.condition}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Grade</dt>
                      <dd className="font-semibold text-ink-900 dark:text-white">Grade {material.grade}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Project origin</dt>
                      <dd className="font-semibold text-ink-900 dark:text-white">{resolvedProject?.name || "Project 1"}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Location</dt>
                      <dd className="font-semibold text-ink-900 dark:text-white">{resolvedProject?.location || "Delhi"}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Passport ID</dt>
                      <dd className="font-mono font-semibold text-ink-900 dark:text-white">{material.id}</dd>

                      {mode !== "receiver" && (
                        <>
                          <dt className="text-steel-500 dark:text-steel-400">Reference price</dt>
                          <dd className="font-semibold text-emerald-800 dark:text-emerald-400">
                            {material.pricePerT !== undefined && material.pricePerT !== null ? `${formatINRPerT(material.pricePerT)}` : "Open to negotiation"}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              {/* 2. Specifications Accordion */}
              <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden dark:border-steel-800 dark:bg-[#1a2b21]/40">
                <button
                  type="button"
                  onClick={() => toggleSection("specifications")}
                  className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
                >
                  <span>Specifications</span>
                  <svg className={`size-4 text-steel-400 transition-transform duration-200 ${openSections.specifications ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openSections.specifications && (
                  <div className="border-t border-steel-100 px-4 py-3 dark:border-steel-800/80 text-xs space-y-2.5">
                    <dl className="grid grid-cols-2 gap-y-2 sm:grid-cols-[130px_1fr]">
                      <dt className="text-steel-500 dark:text-steel-400">Dimensions</dt>
                      <dd className="font-medium text-ink-900 dark:text-white">{material.dimensions || "Bulk / loose salvage aggregate"}</dd>

                      <dt className="text-steel-500 dark:text-steel-400">Volume Range</dt>
                      <dd className="font-medium text-ink-900 dark:text-white">
                        {material.quantityRangeT ? `${material.quantityRangeT[0]} – ${material.quantityRangeT[1]} t` : "Single surveyed batch"}
                      </dd>

                      <dt className="text-steel-500 dark:text-steel-400">Listing status</dt>
                      <dd className="font-medium text-ink-900 dark:text-white capitalize">{material.listingStatus || "published"}</dd>
                    </dl>

                    {material.surveyNotes && (
                      <div className="pt-2 border-t border-steel-100 dark:border-steel-800">
                        <p className="text-steel-500 dark:text-steel-400 mb-1 font-medium">Survey Notes:</p>
                        <p className="text-steel-700 dark:text-steel-300 italic bg-steel-50 dark:bg-white/[0.02] p-2.5 rounded-xl">
                          "{material.surveyNotes}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Evidence & Verification Accordion */}
              <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden dark:border-steel-800 dark:bg-[#1a2b21]/40">
                <button
                  type="button"
                  onClick={() => toggleSection("evidence")}
                  className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2">
                    <span>Evidence &amp; Verification</span>
                    <span className="rounded-full bg-steel-100 px-2 py-0.5 text-[10px] font-semibold text-steel-700 dark:bg-steel-800 dark:text-steel-300">
                      {material.evidence.length} documents
                    </span>
                  </div>
                  <svg className={`size-4 text-steel-400 transition-transform duration-200 ${openSections.evidence ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openSections.evidence && (
                  <div className="border-t border-steel-100 px-4 py-3 dark:border-steel-800/80 text-xs space-y-3">
                    {/* Photos Preview */}
                    {mediaList.length > 0 && (
                      <div>
                        <p className="text-steel-500 dark:text-steel-400 mb-2 font-medium">Inspection Photos</p>
                        <div className="grid grid-cols-3 gap-2">
                          {mediaList.slice(0, 3).map((item) => (
                            <img
                              key={item.id}
                              src={item.src}
                              alt={item.caption}
                              className="aspect-[4/3] rounded-lg object-cover border border-steel-200 dark:border-steel-700"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Document List */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-steel-500 dark:text-steel-400 font-medium">Recorded Certificates &amp; Logs</p>
                      {material.evidence.length > 0 ? (
                        material.evidence.map((doc, idx) => (
                          <div
                            key={doc.id || idx}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-steel-100 bg-steel-50/50 dark:border-steel-800 dark:bg-white/[0.02]"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-ink-900 dark:text-white truncate">{doc.label || doc.kind}</p>
                              <p className="text-[10px] text-steel-500">{doc.kind} · {formatDate(doc.recordedAt)}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              Attached
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-steel-500 italic">No formal verification documents attached yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Availability & Commitments Accordion */}
              <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden dark:border-steel-800 dark:bg-[#1a2b21]/40">
                <button
                  type="button"
                  onClick={() => toggleSection("availability")}
                  className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
                >
                  <span>Availability &amp; Commitments</span>
                  <svg className={`size-4 text-steel-400 transition-transform duration-200 ${openSections.availability ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openSections.availability && (
                  <div className="border-t border-steel-100 px-4 py-3 dark:border-steel-800/80 text-xs space-y-3">
                    {/* Ledger Meters */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-xl border border-steel-200 bg-steel-50/60 p-2 dark:border-steel-800 dark:bg-white/[0.02]">
                        <p className="text-[10px] text-steel-500 uppercase tracking-wider">Total</p>
                        <p className="font-archivo text-xs font-bold text-ink-900 dark:text-white mt-0.5">{ledger.totalT.toFixed(1)} t</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 dark:border-emerald-800/40 dark:bg-emerald-950/20">
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase tracking-wider font-bold">Surplus</p>
                        <p className="font-archivo text-xs font-black text-emerald-800 dark:text-emerald-300 mt-0.5">{ledger.availableT.toFixed(1)} t</p>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2 dark:border-blue-800/40 dark:bg-blue-950/20">
                        <p className="text-[10px] text-blue-700 dark:text-blue-300 uppercase tracking-wider">Booked</p>
                        <p className="font-archivo text-xs font-bold text-blue-800 dark:text-blue-300 mt-0.5">{ledger.committedT.toFixed(1)} t</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-800/40 dark:bg-amber-950/20">
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 uppercase tracking-wider">Reserved</p>
                        <p className="font-archivo text-xs font-bold text-amber-800 dark:text-amber-300 mt-0.5">{ledger.reservedT.toFixed(1)} t</p>
                      </div>
                    </div>

                    {/* Bookings */}
                    {activeBookings.length > 0 ? (
                      <div className="space-y-1.5 pt-2 border-t border-steel-100 dark:border-steel-800">
                        <p className="text-steel-500 dark:text-steel-400 font-medium">Active Bookings ({activeBookings.length})</p>
                        {activeBookings.map((b) => (
                          <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-steel-50 dark:bg-white/[0.02]">
                            <div>
                              <p className="font-semibold text-ink-900 dark:text-white">Order #{b.id.slice(0, 8)}</p>
                              <p className="text-[10px] text-steel-500">{b.tonnesT} t · status: {b.status}</p>
                            </div>
                            <Link to={`/app/orders/${b.id}`} className="text-xs font-semibold text-loop-700 dark:text-loop-300">
                              View →
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-steel-500 italic pt-1">No commitments currently active. 100% available for allocation.</p>
                    )}

                    {onAllocate && ledger.availableT > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => onAllocate(material)}
                          className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 dark:bg-[#1a4a2f] dark:hover:bg-[#25633f]"
                        >
                          + Allocate Surplus to Facility
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Matching & Estimated Landed Cost Accordion */}
              <div className="rounded-2xl border border-steel-200 bg-white overflow-hidden dark:border-steel-800 dark:bg-[#1a2b21]/40">
                <button
                  type="button"
                  onClick={() => toggleSection("matchingCost")}
                  className="flex w-full items-center justify-between p-4 text-left font-archivo text-sm font-bold text-ink-900 dark:text-white hover:bg-steel-50/50 dark:hover:bg-white/[0.02]"
                >
                  <span>{mode === "receiver" ? "Matching & Landed Cost" : "Matching & Estimated Landed Cost"}</span>
                  <svg className={`size-4 text-steel-400 transition-transform duration-200 ${openSections.matchingCost ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openSections.matchingCost && (
                  <div className="border-t border-steel-100 p-4 dark:border-steel-800/80 text-xs space-y-3">
                    {/* Top candidate matches */}
                    {candidateMatches.length > 0 && (
                      <div>
                        <p className="text-steel-500 dark:text-steel-400 mb-2 font-medium">Top Compatible Receiver Yards</p>
                        <div className="space-y-1.5">
                          {candidateMatches.map((cand) => {
                            const rec = dataset.receivers.find((r) => r.id === cand.receiverId);
                            return (
                              <div
                                key={cand.receiverId}
                                className="flex items-center justify-between p-2.5 rounded-xl border border-steel-100 bg-steel-50/50 dark:border-steel-800 dark:bg-white/[0.02]"
                              >
                                <div>
                                  <p className="font-semibold text-ink-900 dark:text-white">{rec?.name || cand.receiverId}</p>
                                  <p className="text-[10px] text-steel-500">{cand.distanceKm} km transit radius</p>
                                </div>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  {Math.round(cand.score * 100)}% Match
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Landed cost summary card */}
                    <div className="pt-2">
                      <LandedCostCard calculation={landedCostCalc} compact />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.aside>

          {/* Delete Confirmation Modal */}
          {showDeleteModal && (
            <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} className="max-w-md p-6">
              <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">Delete Material Passport</h3>
              <p className="mt-2 text-xs text-steel-600 dark:text-gray-300">
                Are you sure you want to delete <strong>{material.name || materialTypeLabel(material.type)}</strong> ({material.id})? This action cannot be undone.
              </p>
              {deleteError && (
                <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{deleteError}</p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl border border-steel-300 px-4 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete Material"}
                </button>
              </div>
            </Modal>
          )}

          {/* Edit Passport Modal */}
          {showEditModal && (
            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} className="max-w-lg p-6">
              <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">Edit Material Passport</h3>
              <p className="mt-1 text-xs text-steel-500">Update specifications and reference pricing for {material.id}.</p>

              <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">Condition</label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value as "good" | "fair" | "poor")}
                    className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  >
                    <option value="good">Good (Reusable / Prime)</option>
                    <option value="fair">Fair (Standard Recyclable)</option>
                    <option value="poor">Poor (Downcyclable / Fill)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">Quality Grade</label>
                  <select
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value as "A" | "B" | "C")}
                    className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  >
                    <option value="A">Grade A (Structural / Direct Re-use)</option>
                    <option value="B">Grade B (Secondary Processing)</option>
                    <option value="C">Grade C (Crushed Aggregate / Bulk)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">Reference Price per Tonne (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">Survey Notes &amp; Observations</label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes regarding dismantling, staging, handling..."
                    className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-steel-100 dark:border-steel-800">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="rounded-xl border border-steel-300 px-4 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="rounded-xl bg-[#164b2d] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#22633e] disabled:opacity-50"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Commercial Terms Negotiation Modal */}
          {showNegotiateModal && (
            <Modal
              isOpen={showNegotiateModal}
              onClose={() => {
                if (!isSubmittingNegotiation) {
                  setShowNegotiateModal(false);
                }
              }}
              className="max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              {negotiationSuccess ? (
                <div className="py-3 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className="mt-3 font-archivo text-xl font-bold text-ink-900 dark:text-white">
                    Commercial Proposal Dispatched!
                  </h3>
                  <p className="mt-2 text-xs text-steel-600 dark:text-steel-300">
                    Your counter-terms for <strong>{negotiateQuantity} tonnes</strong> of{" "}
                    <strong>{materialTypeLabel(material.type)}</strong> have been submitted to{" "}
                    <strong>{resolvedProject?.name || "the provider"}</strong>.
                  </p>

                  <div className="mt-4 rounded-xl border border-steel-200 bg-steel-50/70 p-3.5 text-left text-xs dark:border-steel-800 dark:bg-steel-900/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-steel-500">Proposed Quantity</span>
                        <p className="font-semibold text-ink-900 dark:text-white">{negotiateQuantity} tonnes</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-steel-500">Proposed Price</span>
                        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {negotiatePrice ? `₹${Number(negotiatePrice).toLocaleString("en-IN")}/tonne` : "Standard ex-works"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-steel-500">Target Date</span>
                        <p className="font-semibold text-ink-900 dark:text-white">{negotiateDate || "Standard Lead Time"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-steel-500">Destination</span>
                        <p className="font-semibold text-ink-900 dark:text-white truncate">{negotiateDestination}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNegotiateModal(false);
                        onClose();
                        navigate(`/app/receiver/demand?demand=${encodeURIComponent(negotiationSuccess.demandId)}`);
                      }}
                      className="inline-flex min-h-10 w-full sm:w-auto items-center justify-center rounded-xl bg-[#164b2d] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#1e5836]"
                    >
                      View Active Requests →
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNegotiateModal(false)}
                      className="inline-flex min-h-10 w-full sm:w-auto items-center justify-center rounded-xl border border-steel-300 bg-white px-5 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-transparent dark:text-steel-200"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-steel-100 dark:border-steel-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Bilateral Proposal
                        </span>
                        <span className="text-[11px] font-mono text-steel-400">{material.id}</span>
                      </div>
                      <h3 className="mt-1 font-archivo text-lg font-bold text-ink-900 dark:text-white">
                        Negotiate Commercial Terms
                      </h3>
                      <p className="text-xs text-steel-500 dark:text-steel-400">
                        Propose counter-pricing, staged dispatch, or quality stipulations for {materialTypeLabel(material.type)}.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleNegotiateSubmit} className="mt-4 space-y-4 text-xs">
                    {/* Material Reference info banner */}
                    <div className="flex items-center justify-between rounded-xl bg-steel-50 p-3 dark:bg-steel-900/60 border border-steel-200 dark:border-steel-800">
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-white">{materialTypeLabel(material.type)} · Grade {material.grade}</p>
                        <p className="text-[11px] text-steel-500">Listed ex-works: {material.pricePerT ? `₹${material.pricePerT.toLocaleString("en-IN")}/t` : "Price on request"}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-ink-900 dark:text-white">{material.quantityT} t</span>
                        <p className="text-[11px] text-steel-500">Total Available</p>
                      </div>
                    </div>

                    {/* Quantity & Counter Price Grid */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-steel-700 dark:text-gray-300">
                            Target Quantity (Tonnes)
                          </label>
                          <span className="text-[10px] text-steel-500">Max {material.quantityT} t</span>
                        </div>
                        <input
                          type="number"
                          min="0.1"
                          max={material.quantityT}
                          step="0.1"
                          required
                          value={negotiateQuantity}
                          onChange={(e) => setNegotiateQuantity(e.target.value)}
                          placeholder="e.g. 10"
                          className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white font-medium"
                        />
                        <div className="mt-1.5 flex gap-1.5">
                          {[0.25, 0.5, 1].map((pct) => {
                            const val = (Math.round((material.quantityT * pct) * 10) / 10).toFixed(1);
                            return (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setNegotiateQuantity(String(val))}
                                className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[10px] font-semibold text-steel-700 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-200"
                              >
                                {pct === 1 ? "100% (All)" : `${pct * 100}%`}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-steel-700 dark:text-gray-300">
                            Counter-Offer Price (₹/t)
                          </label>
                          {material.pricePerT && negotiatePrice && Number(negotiatePrice) > 0 && (
                            <span className={`text-[10px] font-semibold ${
                              Number(negotiatePrice) < material.pricePerT
                                ? "text-emerald-600 dark:text-emerald-400"
                                : Number(negotiatePrice) > material.pricePerT
                                ? "text-amber-600"
                                : "text-steel-500"
                            }`}>
                              {Number(negotiatePrice) < material.pricePerT
                                ? `${(((material.pricePerT - Number(negotiatePrice)) / material.pricePerT) * 100).toFixed(0)}% lower`
                                : Number(negotiatePrice) === material.pricePerT
                                ? "At listed price"
                                : "Premium offered"}
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          required
                          value={negotiatePrice}
                          onChange={(e) => setNegotiatePrice(e.target.value)}
                          placeholder="e.g. 11000"
                          className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white font-medium"
                        />
                        {negotiateQuantity && negotiatePrice && Number(negotiateQuantity) > 0 && Number(negotiatePrice) > 0 && (
                          <p className="mt-1.5 text-[11px] text-steel-500 dark:text-steel-400">
                            Est. Total: <strong className="text-ink-900 dark:text-white">₹{(Number(negotiateQuantity) * Number(negotiatePrice)).toLocaleString("en-IN")}</strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Delivery Date & Destination Yard */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                          Target Intake / Delivery Date
                        </label>
                        <input
                          type="date"
                          required
                          value={negotiateDate}
                          onChange={(e) => setNegotiateDate(e.target.value)}
                          className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white font-medium"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-steel-700 dark:text-gray-300 mb-1">
                          Destination / Receiving Site
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={250}
                          value={negotiateDestination}
                          onChange={(e) => setNegotiateDestination(e.target.value)}
                          placeholder="Site name & City"
                          className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white font-medium"
                        />
                      </div>
                    </div>

                    {/* Commercial Stipulations & Notes */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-steel-700 dark:text-gray-300">
                          Commercial Stipulations &amp; Conditions
                        </label>
                        <span className="text-[10px] text-steel-400">Click chips to attach</span>
                      </div>

                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {COMMERCIAL_STIPULATIONS.map((stip) => {
                          const isSelected = negotiateNotes.includes(stip);
                          return (
                            <button
                              key={stip}
                              type="button"
                              onClick={() => toggleStipulation(stip)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                                isSelected
                                  ? "bg-emerald-700 text-white dark:bg-emerald-600 shadow-2xs"
                                  : "border border-steel-200 bg-steel-50 text-steel-700 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-300 dark:hover:bg-steel-700"
                              }`}
                            >
                              {isSelected ? "✓ " : "+ "}{stip}
                            </button>
                          );
                        })}
                      </div>

                      <textarea
                        rows={3}
                        value={negotiateNotes}
                        onChange={(e) => setNegotiateNotes(e.target.value)}
                        placeholder="Add payment milestones, staging constraints, gate intake hours, or quality criteria..."
                        className="w-full rounded-xl border border-steel-300 bg-white px-3 py-2 text-ink-900 dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                      />
                    </div>

                    {negotiationError && (
                      <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                        {negotiationError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-3 border-t border-steel-100 dark:border-steel-800">
                      <button
                        type="button"
                        disabled={isSubmittingNegotiation}
                        onClick={() => setShowNegotiateModal(false)}
                        className="rounded-xl border border-steel-300 px-4 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:text-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        id="submit-negotiation-terms-btn"
                        disabled={isSubmittingNegotiation}
                        className="rounded-xl bg-[#164b2d] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#22633e] disabled:opacity-50 transition"
                      >
                        {isSubmittingNegotiation ? "Transmitting Proposal..." : "Submit Commercial Proposal"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </Modal>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
