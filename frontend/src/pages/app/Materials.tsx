import PageMeta from "@/components/common/PageMeta";
import AllocateSurplusModal from "@/components/greenloop/AllocateSurplusModal";
import MaterialPassportDrawer from "@/components/greenloop/MaterialPassportDrawer";
import { materialMediaFor } from "@/config/appMedia";
import type { MaterialCondition, MaterialPassport, MaterialTypeKey } from "@shared/domain/types";
import { computeMaterialLedger, type MaterialLedger } from "@shared/domain/capacity";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { isReusableAsset, materialTypeLabel } from "@/utils";
import { useMemo, useState, useId, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";

type MaterialCategory = "all" | MaterialTypeKey | "other";
type InventoryTab = "all" | "surplus" | "committed" | "drafts_paused" | "archived";
type SortKey = "newest" | "quantity-desc" | "quantity-asc" | "surplus-desc" | "grade" | "condition";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "surplus-desc", label: "Available Surplus: High to Low" },
  { id: "quantity-desc", label: "Total Volume: High to Low" },
  { id: "quantity-asc", label: "Total Volume: Low to High" },
  { id: "grade", label: "Grade: A to C" },
  { id: "condition", label: "Condition: Best First" },
];

const knownTypes = new Set<string>(["concrete", "brick", "steel", "timber", "plasterboard", "glass"]);

// Contextual menu for individual material card
interface CardMenuProps {
  material: MaterialPassport;
  ledger: MaterialLedger;
  onOpenPassport: () => void;
  onAllocate: () => void;
  onStatusChange: (status: "draft" | "published" | "paused" | "archived") => void;
  onDelete: () => void;
}

function CardMenu({
  material,
  ledger,
  onOpenPassport,
  onAllocate,
  onStatusChange,
  onDelete,
}: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex size-7 items-center justify-center rounded-lg text-steel-400 hover:bg-steel-100 hover:text-ink-900 dark:text-steel-400 dark:hover:bg-steel-800 dark:hover:text-white transition"
        title="More actions"
        aria-label="More actions"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-steel-200 bg-white py-1.5 shadow-xl dark:border-steel-700 dark:bg-[#1b2b22] text-xs">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenPassport();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            <span>View Passport</span>
          </button>

          {ledger.availableT > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAllocate();
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-[#164b2d] hover:bg-[#edf5ef] dark:text-[#00e599] dark:hover:bg-steel-800/60"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              <span>Allocate Surplus</span>
            </button>
          )}

          <Link
            to={`/app/market-demand?view=receivers&materialId=${encodeURIComponent(material.id)}&type=${encodeURIComponent(material.type)}`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <span>Find Receivers</span>
          </Link>

          <Link
            to={`/app/auctions?material=${encodeURIComponent(material.id)}`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-steel-700 hover:bg-steel-50 dark:text-steel-200 dark:hover:bg-steel-800/60"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" /><path d="m16 16 6-6" /></svg>
            <span>Create Auction</span>
          </Link>

          <div className="my-1 border-t border-steel-100 dark:border-steel-700/60" />

          {material.listingStatus === "published" ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onStatusChange("paused");
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-steel-800/60"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              <span>Pause Listing</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onStatusChange("published");
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-steel-800/60"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              <span>Publish Listing</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-steel-800/60"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            <span>Delete Material</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Materials() {
  const { dataset, requestCapacityAction, setMaterialListingStatusAction, deleteMaterialAction } = useGreenLoopStore();
  const [params, setParams] = useSearchParams();
  const selectedProjectId = params.get("project");

  const [activeTab, setActiveTab] = useState<InventoryTab>("all");
  const [category, setCategory] = useState<MaterialCategory>("all");
  const [query, setQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reusableOnly, setReusableOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [showFilters, setShowFilters] = useState(false);

  // Active Passport drawer selection
  const [activePassportId, setActivePassportId] = useState<string | null>(() => params.get("passport") || null);

  const [allocatingMaterial, setAllocatingMaterial] = useState<{ material: MaterialPassport; ledger: MaterialLedger } | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const conditionSelectId = useId();
  const gradeSelectId = useId();
  const sortSelectId = useId();

  const projectName = useCallback((id: string) => dataset.projects.find((project) => project.id === id)?.name ?? id, [dataset.projects]);
  const projectLocation = useCallback((id: string) => dataset.projects.find((project) => project.id === id)?.location ?? "", [dataset.projects]);

  const computeLedger = useCallback((material: MaterialPassport): MaterialLedger => {
    return computeMaterialLedger(material, dataset.bookings, 0, dataset.verifications);
  }, [dataset.bookings, dataset.verifications]);

  // Sync passport query param
  useEffect(() => {
    const passportParam = params.get("passport");
    if (passportParam && passportParam !== activePassportId) {
      setActivePassportId(passportParam);
    } else if (!passportParam && activePassportId) {
      // Keep state in sync if cleared
    }
  }, [params, activePassportId]);

  useEffect(() => {
    const allocateMatId = params.get("allocate");
    if (allocateMatId && !allocatingMaterial) {
      const mat = dataset.materials.find((m) => m.id === allocateMatId);
      if (mat) {
        setAllocatingMaterial({ material: mat, ledger: computeLedger(mat) });
      }
    }
  }, [params, dataset.materials, computeLedger, allocatingMaterial]);

  // Active passport entity
  const activePassport = useMemo(() => {
    if (!activePassportId) return null;
    return dataset.materials.find((m) => m.id === activePassportId) ?? null;
  }, [activePassportId, dataset.materials]);

  const activePassportProject = useMemo(() => {
    if (!activePassport) return undefined;
    return dataset.projects.find((p) => p.id === activePassport.projectId);
  }, [activePassport, dataset.projects]);

  const handleOpenPassport = (id: string) => {
    setActivePassportId(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("passport", id);
      return next;
    });
  };

  const handleClosePassport = () => {
    setActivePassportId(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("passport");
      return next;
    });
  };

  const clearAllFilters = () => {
    setCategory("all");
    setQuery("");
    setConditionFilter("all");
    setGradeFilter("all");
    setStatusFilter("all");
    setReusableOnly(false);
    setParams({});
  };

  const hasActiveFilters = Boolean(
    category !== "all" ||
    query.trim() ||
    conditionFilter !== "all" ||
    gradeFilter !== "all" ||
    statusFilter !== "all" ||
    reusableOnly ||
    selectedProjectId
  );

  const visibleMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dataset.materials
      .filter((material) => {
        // Tab filtering
        if (activeTab === "archived") {
          if (material.listingStatus !== "archived") return false;
        } else {
          if (material.listingStatus === "archived") return false;
          const ledger = computeLedger(material);
          if (activeTab === "surplus" && ledger.availableT <= 0) return false;
          if (activeTab === "committed" && (ledger.availableT > 0 || ledger.committedT <= 0)) return false;
          if (activeTab === "drafts_paused" && material.listingStatus !== "draft" && material.listingStatus !== "paused") return false;
        }

        const isOther = !knownTypes.has(material.type);
        const matchesCategory =
          category === "all" ||
          (category === "other" ? isOther : material.type === category);

        const project = dataset.projects.find((item) => item.id === material.projectId);
        const projName = project?.name ?? material.projectId;
        const projLoc = project?.location ?? "";

        const matchesQuery =
          !normalizedQuery ||
          [
            materialTypeLabel(material.type),
            material.id,
            projName,
            projLoc,
            material.status,
            material.condition,
            material.grade,
            material.surveyNotes ?? "",
            material.originalUnit ?? "",
          ].some((value) => value.toLowerCase().includes(normalizedQuery));

        const matchesCondition =
          conditionFilter === "all" || material.condition === conditionFilter;

        const matchesGrade =
          gradeFilter === "all" || material.grade === gradeFilter;

        const matchesStatus =
          statusFilter === "all" || material.status === statusFilter;

        const matchesReusable =
          !reusableOnly || isReusableAsset(material);

        const matchesProject =
          !selectedProjectId || material.projectId === selectedProjectId;

        return (
          matchesCategory &&
          matchesQuery &&
          matchesCondition &&
          matchesGrade &&
          matchesStatus &&
          matchesReusable &&
          matchesProject
        );
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "surplus-desc": {
            const surpA = computeLedger(a).availableT;
            const surpB = computeLedger(b).availableT;
            return surpB - surpA;
          }
          case "quantity-desc":
            return b.quantityT - a.quantityT;
          case "quantity-asc":
            return a.quantityT - b.quantityT;
          case "grade":
            return a.grade.localeCompare(b.grade);
          case "condition": {
            const order: Record<MaterialCondition, number> = { good: 1, fair: 2, poor: 3 };
            return (order[a.condition] ?? 4) - (order[b.condition] ?? 4);
          }
          case "newest":
          default:
            return (b.surveyedAt ?? "").localeCompare(a.surveyedAt ?? "") || b.id.localeCompare(a.id);
        }
      });
  }, [
    activeTab,
    category,
    conditionFilter,
    dataset.materials,
    dataset.projects,
    gradeFilter,
    query,
    reusableOnly,
    selectedProjectId,
    sortBy,
    statusFilter,
    computeLedger,
  ]);

  const handleListingStatusChange = async (
    materialId: string,
    status: "draft" | "published" | "paused" | "archived"
  ) => {
    try {
      const ok = await setMaterialListingStatusAction(materialId, status);
      if (ok) {
        setNotificationMsg({
          text: `Listing status updated to ${status}.`,
          type: "success",
        });
        setTimeout(() => setNotificationMsg(null), 3000);
      } else {
        setNotificationMsg({
          text: `Failed to set listing status to ${status}.`,
          type: "error",
        });
        setTimeout(() => setNotificationMsg(null), 4000);
      }
    } catch (err) {
      setNotificationMsg({
        text: err instanceof Error ? err.message : "Error updating listing status.",
        type: "error",
      });
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    const hasBookings = dataset.bookings.some(
      (b) => b.materialId === materialId && b.status !== "cancelled"
    );
    if (hasBookings) {
      setNotificationMsg({
        text: "Cannot delete material with confirmed active commitments or deliveries.",
        type: "error",
      });
      setTimeout(() => setNotificationMsg(null), 4000);
      return;
    }
    if (!window.confirm("Are you sure you want to delete this material passport? This action cannot be undone.")) {
      return;
    }
    try {
      const ok = await deleteMaterialAction(materialId);
      if (ok) {
        if (activePassportId === materialId) {
          handleClosePassport();
        }
        setNotificationMsg({
          text: "Material passport deleted successfully.",
          type: "success",
        });
        setTimeout(() => setNotificationMsg(null), 3000);
      } else {
        setNotificationMsg({
          text: "Failed to delete material passport.",
          type: "error",
        });
        setTimeout(() => setNotificationMsg(null), 4000);
      }
    } catch (err) {
      setNotificationMsg({
        text: err instanceof Error ? err.message : "Error deleting material.",
        type: "error",
      });
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  const handleAllocateSurplus = async (
    materialId: string,
    receiverId: string,
    slotDate: string,
    tonnesT: number
  ) => {
    const res = await requestCapacityAction({
      materialId,
      receiverId,
      slotId: slotDate,
      tonnesT,
    });
    return Boolean(res);
  };

  return (
    <div className="relative min-h-[calc(100vh-64px)] bg-[#f6f5f0] text-[#26342b] dark:bg-[#101913] dark:text-[#f2f3ef]">
      <PageMeta
        title="Material Inventory | GreenLoop"
        description="Materials available from your projects and recovery sites."
      />

      {/* Floating Notification */}
      {notificationMsg && (
        <div
          role={notificationMsg.type === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-xl backdrop-blur-md ${
            notificationMsg.type === "error"
              ? "border-red-400 bg-red-900/90 text-white"
              : "border-emerald-400 bg-[#0d2316]/95 text-[#00e599]"
          }`}
        >
          <span>{notificationMsg.type === "error" ? "✕" : "✓"}</span>
          <span>{notificationMsg.text}</span>
        </div>
      )}

      {/* Main Content Area (shrinks with smooth margin when drawer is open on desktop) */}
      <div
        className={`px-4 py-6 sm:px-6 lg:px-8 transition-all duration-300 ${
          activePassport ? "lg:pe-[520px] xl:pe-[540px]" : ""
        }`}
      >
        {/* Header Section matching reference */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              Material Inventory
            </h1>
            <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">
              Materials available from your projects and recovery sites.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to={selectedProjectId ? `/app/materials/new?project=${encodeURIComponent(selectedProjectId)}` : "/app/materials/new"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#164b2d] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#22633e] dark:bg-[#1a5c37] dark:hover:bg-[#237748] transition"
            >
              <span className="text-sm font-bold leading-none">+</span>
              <span>Add Material</span>
            </Link>
          </div>
        </div>

        {/* Filter and Count Bar matching reference */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-steel-200/80 pb-4 dark:border-steel-800">
          <div className="flex items-center gap-3">
            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`flex size-9 items-center justify-center rounded-xl border transition shadow-2xs ${
                showFilters || hasActiveFilters
                  ? "border-[#164b2d] bg-[#164b2d] text-white dark:border-[#00e599] dark:bg-[#00e599] dark:text-[#0c1811]"
                  : "border-steel-200 bg-white text-steel-600 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-300 dark:hover:bg-steel-800"
              }`}
              title="Toggle filters"
              aria-label="Toggle filters"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            {/* Material Count Badge */}
            <span className="text-sm font-medium text-steel-600 dark:text-steel-400">
              {visibleMaterials.length} material{visibleMaterials.length === 1 ? "" : "s"}
            </span>

            {/* Quick status tabs */}
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === "all"
                    ? "bg-[#164b2d] text-white dark:bg-[#1a5c37]"
                    : "text-steel-600 hover:bg-steel-200/60 dark:text-steel-400 dark:hover:bg-steel-800"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("surplus")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === "surplus"
                    ? "bg-[#164b2d] text-white dark:bg-[#1a5c37]"
                    : "text-steel-600 hover:bg-steel-200/60 dark:text-steel-400 dark:hover:bg-steel-800"
                }`}
              >
                Surplus Available
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("committed")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === "committed"
                    ? "bg-[#164b2d] text-white dark:bg-[#1a5c37]"
                    : "text-steel-600 hover:bg-steel-200/60 dark:text-steel-400 dark:hover:bg-steel-800"
                }`}
              >
                Committed
              </button>
            </div>
          </div>

          {/* Right Side: Sort Order Dropdown matching reference */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                id={sortSelectId}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="appearance-none rounded-xl border border-steel-200 bg-white py-1.5 pe-8 ps-3 text-xs font-medium text-steel-700 shadow-2xs hover:bg-steel-50 focus:border-[#164b2d] focus:outline-none dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-300 dark:hover:bg-steel-800"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pe-2.5 text-steel-500 dark:text-steel-400">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable Filter Tray */}
        {showFilters && (
          <div className="mt-4 rounded-2xl border border-steel-200 bg-white p-4 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
              {/* Search Query */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-steel-600 dark:text-steel-400 uppercase tracking-wider mb-1">
                  Search
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search material, project, ID..."
                    className="h-9 w-full rounded-xl border border-steel-200 bg-steel-50 px-3 text-xs text-ink-900 focus:border-[#164b2d] focus:bg-white focus:outline-none dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-steel-400 hover:text-ink-900"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Material Type */}
              <div>
                <label className="block text-[11px] font-semibold text-steel-600 dark:text-steel-400 uppercase tracking-wider mb-1">
                  Material Type
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MaterialCategory)}
                  className="h-9 w-full rounded-xl border border-steel-200 bg-steel-50 px-2.5 text-xs text-ink-900 focus:border-[#164b2d] focus:bg-white focus:outline-none dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="all">All Types</option>
                  <option value="concrete">Concrete</option>
                  <option value="brick">Brick</option>
                  <option value="steel">Steel</option>
                  <option value="timber">Timber / Wood</option>
                  <option value="plasterboard">Plasterboard</option>
                  <option value="glass">Glass</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Quality Grade */}
              <div>
                <label htmlFor={gradeSelectId} className="block text-[11px] font-semibold text-steel-600 dark:text-steel-400 uppercase tracking-wider mb-1">
                  Grade
                </label>
                <select
                  id={gradeSelectId}
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="h-9 w-full rounded-xl border border-steel-200 bg-steel-50 px-2.5 text-xs text-ink-900 focus:border-[#164b2d] focus:bg-white focus:outline-none dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="all">All Grades</option>
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                </select>
              </div>

              {/* Condition */}
              <div>
                <label htmlFor={conditionSelectId} className="block text-[11px] font-semibold text-steel-600 dark:text-steel-400 uppercase tracking-wider mb-1">
                  Condition
                </label>
                <select
                  id={conditionSelectId}
                  value={conditionFilter}
                  onChange={(e) => setConditionFilter(e.target.value)}
                  className="h-9 w-full rounded-xl border border-steel-200 bg-steel-50 px-2.5 text-xs text-ink-900 focus:border-[#164b2d] focus:bg-white focus:outline-none dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
                >
                  <option value="all">All Conditions</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            </div>

            {/* Checkbox and Clear */}
            <div className="mt-3 flex items-center justify-between border-t border-steel-100 pt-3 dark:border-steel-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-steel-700 dark:text-steel-300">
                <input
                  type="checkbox"
                  checked={reusableOnly}
                  onChange={(e) => setReusableOnly(e.target.checked)}
                  className="size-4 rounded border-steel-300 text-[#164b2d] focus:ring-[#164b2d]"
                />
                <span>Reusable assets only</span>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-semibold text-emerald-800 hover:underline dark:text-emerald-400"
                >
                  Reset all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Material Listings Grid matching Reference */}
        <div className="mt-6">
          {visibleMaterials.length > 0 ? (
            <div
              className={`grid gap-4 sm:gap-5 ${
                activePassport
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
              }`}
              aria-label="Material Inventory"
            >
              {visibleMaterials.map((material) => {
                const ledger = computeLedger(material);
                const isSelected = activePassportId === material.id;
                const isVerified = material.status === "verified" || material.verificationStatus === "verified";
                const isRejected = material.verificationStatus === "rejected";

                return (
                  <article
                    key={material.id}
                    className={`group flex flex-col justify-between rounded-2xl border bg-white p-3 shadow-2xs transition-all hover:border-[#9ec1a5] hover:shadow-xs dark:bg-[#17251d] ${
                      isSelected
                        ? "border-[#164b2d] ring-2 ring-[#164b2d]/20 dark:border-[#00e599] dark:ring-[#00e599]/20"
                        : "border-steel-200/90 dark:border-steel-800"
                    }`}
                  >
                    <div>
                      {/* Material Image */}
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-steel-100 dark:bg-steel-800">
                        <img
                          src={materialMediaFor(material.type).src}
                          alt={material.name || materialTypeLabel(material.type)}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>

                      {/* Title & Three-dots Contextual Menu Row */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <h2 className="font-archivo text-base font-bold text-ink-900 dark:text-white truncate" title={material.name || materialTypeLabel(material.type)}>
                          {material.name || materialTypeLabel(material.type)}
                        </h2>
                        <CardMenu
                          material={material}
                          ledger={ledger}
                          onOpenPassport={() => handleOpenPassport(material.id)}
                          onAllocate={() => setAllocatingMaterial({ material, ledger })}
                          onStatusChange={(status) => handleListingStatusChange(material.id, status)}
                          onDelete={() => handleDeleteMaterial(material.id)}
                        />
                      </div>

                      {/* Project Origin & Location */}
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-steel-500 dark:text-steel-400 font-medium truncate">
                        <svg className="size-3.5 shrink-0 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="truncate">{projectName(material.projectId)} · {projectLocation(material.projectId) || "Delhi"}</span>
                      </p>

                      {/* Available Quantity */}
                      <p className="mt-2 text-sm font-bold font-archivo text-ink-900 dark:text-white">
                        <span>{ledger.availableT.toFixed(ledger.availableT % 1 === 0 ? 0 : 1)} t</span>{" "}
                        <span className="font-normal text-xs text-steel-500 dark:text-steel-400">available</span>
                      </p>

                      {/* Verification Status & Quality Grade Badges */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                          Grade {material.grade}
                        </span>
                      </div>
                    </div>

                    {/* View Passport Action Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenPassport(material.id)}
                      className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#164b2d] px-3.5 py-2.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#22633e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164b2d] dark:bg-[#1c5434] dark:hover:bg-[#287247]"
                    >
                      <span>View Passport</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-steel-200 bg-white p-12 text-center dark:border-steel-800 dark:bg-[#17251d]">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-steel-100 text-steel-500 dark:bg-steel-800 dark:text-steel-400">
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </span>
              <h3 className="mt-3 font-archivo text-base font-bold text-ink-900 dark:text-white">
                No materials found
              </h3>
              <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">
                {hasActiveFilters
                  ? "Try clearing filters to see more materials."
                  : "No materials are currently listed in this category."}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-3 inline-flex items-center rounded-xl bg-[#164b2d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#22633e] transition"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Material Passport Right-Side Drawer */}
      <MaterialPassportDrawer
        material={activePassport}
        project={activePassportProject}
        isOpen={Boolean(activePassport)}
        onClose={handleClosePassport}
        onAllocate={(mat) => setAllocatingMaterial({ material: mat, ledger: computeLedger(mat) })}
      />

      {/* Partial Surplus Allocation Modal */}
      {allocatingMaterial && (
        <AllocateSurplusModal
          isOpen={Boolean(allocatingMaterial)}
          onClose={() => setAllocatingMaterial(null)}
          material={allocatingMaterial.material}
          ledger={allocatingMaterial.ledger}
          receivers={dataset.receivers}
          initialReceiverId={params.get("receiver") ?? undefined}
          onAllocate={handleAllocateSurplus}
        />
      )}
    </div>
  );
}
