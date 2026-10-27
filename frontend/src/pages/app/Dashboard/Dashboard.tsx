import PageMeta from "@/components/common/PageMeta";
import AdvancedImpactPanel from "@/components/monetization/AdvancedImpactPanel";
import { ProjectStatusChip } from "@/components/greenloop/AppExploration";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import CapacityBar from "@/components/greenloop/CapacityBar";
import EventLog from "@/components/greenloop/EventLog";
import { MediaPanel } from "@/components/greenloop/kit";
import RecoveryFlow from "@/components/greenloop/RecoveryFlow";
import StatusBadge from "@/components/greenloop/StatusBadge";
import Badge from "@/components/ui/badge/Badge";
import { ambientMedia, materialMediaFor, projectMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { slotLedger, computeMaterialLedger } from "@shared/domain/capacity";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINR, formatINRPerT, materialTypeLabel } from "@/utils";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Bookings from "../Bookings";
import Deliveries from "../Deliveries";
import ReceiverDeliveriesPage from "../receiver/ReceiverDeliveries";
import {
CapacityTimelineChart,
CompositionChart,
KpiCard,
PlannedActualChart,
ProjectRecoveryChart,
ReceiverCapacityChart,
RecoveryFlowChart,
} from "../Reports";

/**
 * One Dashboard per workspace. Merges the former Reports page and Operations
 * console into a single operational home: attention items, KPIs, analytics and
 * recent activity. Nothing was removed — everything from both pages lives here.
 */
export default function Dashboard() {
  const { user } = useAuth();
  return user?.activeWorkspace === "receiver" ? <ReceiverDashboard /> : <ProviderDashboard />;
}

type ProviderProps = ReturnType<typeof useProviderDashboardData>;

function useProviderDashboardData() {
  const { dataset } = useGreenLoopStore();
  return useMemo(() => {
    const holdBookings = dataset.bookings.filter((b) => b.status === "hold");
    const upcomingBookings = dataset.bookings.filter((b) => b.status !== "cancelled").slice(0, 6);
    const readyToSend = dataset.bookings.filter((booking) => booking.status === "confirmed" && booking.receiverAcceptedAt && !booking.loadRef);
    const unassignedMaterials = dataset.materials.filter((material) => material.status !== "verified" && material.status !== "dispatched" && !dataset.allocations.some((allocation) => allocation.materialId === material.id && allocation.status !== "cancelled"));

    // 🔴 Lane 1: Dispatch Today (Confirmed loads ready for staging / dispatch)
    const dispatchTasks = readyToSend.map((booking) => {
      const mat = dataset.materials.find((m) => m.id === booking.materialId);
      const receiver = dataset.receivers.find((r) => r.id === booking.receiverId);
      return {
        id: booking.id,
        title: `${booking.tonnesT.toFixed(1)} t ${mat?.type ? materialTypeLabel(mat.type) : "Material"} Confirmed`,
        subtitle: `Destination: ${receiver?.name || "Intake Facility"} · Booking ${booking.id}`,
        action: "Stage & Dispatch",
        to: `/app/orders/${booking.id}`,
      };
    });

    // 🟡 Lane 2: Pending Commercial Proposals (Counter-offers, buyer requests & holds)
    const proposalsTasks: Array<{ id: string; title: string; subtitle: string; action: string; to: string }> = [];

    (dataset.negotiations || []).forEach((neg) => {
      const awaiting = neg.proposals.find((p) => p.status === "awaiting_provider_approval");
      if (awaiting) {
        proposalsTasks.push({
          id: `prop-${awaiting.id}`,
          title: `Terms Counter-Offer: ${awaiting.quantityT} t @ ${formatINRPerT(awaiting.pricePerT)}`,
          subtitle: `Slot: ${awaiting.slotId} · Version ${awaiting.version}`,
          action: "Review Terms",
          to: `/app/negotiation/${neg.offerId}`,
        });
      }
    });

    dataset.demands
      .filter((d) => (d.status === "OPEN" || d.status === "PARTIALLY_COVERED") && (d.targetProviderId || d.targetMaterialId))
      .slice(0, 3)
      .forEach((d) => {
        proposalsTasks.push({
          id: `demand-${d.id}`,
          title: `Direct Buyer Request: ${d.requiredT} t ${materialTypeLabel(d.materialType)}`,
          subtitle: `Location: ${d.location} · Budget: ${d.budgetPerT ? formatINRPerT(d.budgetPerT) : "Negotiable"}`,
          action: "Respond to Demand",
          to: `/app/market-demand?view=demands&selected=${d.id}`,
        });
      });

    holdBookings.slice(0, 3).forEach((b) => {
      if (!proposalsTasks.some((p) => p.id.includes(b.id))) {
        const mat = dataset.materials.find((m) => m.id === b.materialId);
        proposalsTasks.push({
          id: `hold-${b.id}`,
          title: `${b.tonnesT.toFixed(1)} t ${mat?.type ? materialTypeLabel(mat.type) : "Material"} on Hold`,
          subtitle: `Awaiting receiver availability confirmation`,
          action: "Review Booking",
          to: `/app/orders/${b.id}`,
        });
      }
    });

    // 🔵 Lane 3: Gate Verification Reviews (Weighbridge intake reconciliations)
    const gateTasks: Array<{ id: string; title: string; subtitle: string; action: string; to: string }> = [];
    dataset.verifications
      .filter((v) => v.status === "pending" || v.rejectedT > 0)
      .slice(0, 4)
      .forEach((v) => {
        const mat = dataset.materials.find((m) => m.id === v.materialId);
        gateTasks.push({
          id: `gate-${v.id}`,
          title: `Weighbridge Intake: ${v.actualT.toFixed(1)} t ${mat?.type ? materialTypeLabel(mat.type) : "Cargo"}`,
          subtitle: v.rejectedT > 0
            ? `⚠️ Variance: ${v.rejectedT.toFixed(1)} t rejected (${v.rejectReason || "Quality variance"})`
            : `Gross Weighed: ${v.actualT.toFixed(1)} t · Ticket Ref: ${v.loadRef}`,
          action: "Review Intake",
          to: `/app/orders/${v.bookingId}`,
        });
      });

    const attentionTasks: Array<{ id: string; title: string; action: string; to: string; materialId?: string }> = [
      ...unassignedMaterials.map((material) => ({ id: material.id, title: `${material.quantityT.toFixed(1)} t ${materialTypeLabel(material.type)} needs a receiver`, action: "Find receiver", to: `/app/market-demand?view=receivers&materialId=${encodeURIComponent(material.id)}&type=${encodeURIComponent(material.type)}`, materialId: material.id })),
      ...readyToSend.map((booking) => ({ id: booking.id, title: `${booking.tonnesT.toFixed(1)} t booking is ready to dispatch`, action: "Send load", to: "/app/deliveries" })),
      ...holdBookings.map((booking) => ({ id: booking.id, title: `${booking.tonnesT.toFixed(1)} t request is waiting on capacity`, action: "Review booking", to: "/app/bookings" })),
    ];
    return { dataset, holdBookings, upcomingBookings, dispatchTasks, proposalsTasks, gateTasks, attentionTasks };
  }, [dataset]);
}

function DashboardHero({ eyebrow, title, description: _description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="relative mb-5 min-h-40 overflow-hidden border border-[#1e3828] bg-[#0d1c14] dark:border-steel-800 sm:min-h-44 rounded-2xl shadow-sm">
      <img src={ambientMedia.surveyHero.src} alt={ambientMedia.surveyHero.alt} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0d1c14]/95 via-[#0d1c14]/80 to-[#0d1c14]/30" aria-hidden="true" />
      <div className="relative flex min-h-40 max-w-3xl flex-col justify-end px-5 py-5 text-white sm:min-h-44 sm:px-7 sm:py-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#00e599]">
          <span className="size-1.5 rounded-full bg-[#00e599]" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1 className="mt-1.5 font-archivo font-bold tracking-tight text-2xl sm:text-3xl lg:text-4xl">{title}</h1>
      </div>
    </header>
  );
}

function NeedsAttention<T extends { id: string; title: string; action: string; to: string; materialId?: string }>({ tasks, dataset }: { tasks: T[]; dataset: ProviderProps["dataset"] }) {
  return (
    <section className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/20 shadow-xs">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v4M12 16.5h.01" /></svg>
        </span>
        <h2 className="font-archivo text-sm font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">Needs Attention</h2>
        {tasks.length > 0 && <span className="font-mono text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full border border-amber-300/40">{tasks.length}</span>}
      </div>
      {tasks.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => {
            const material = task.materialId ? dataset.materials.find((item) => item.id === task.materialId) : undefined;
            const media = material ? materialMedia(material)[0] : undefined;
            return (
              <li key={task.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-amber-500/20 bg-white p-3 shadow-2xs dark:border-amber-500/20 dark:bg-[#121c16]/80">
                {media ? (
                  <img src={media.src} alt={media.caption} className="size-12 shrink-0 rounded-lg border border-steel-200 object-cover dark:border-steel-800" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug text-ink-900 dark:text-white">{task.title}</p>
                  <Link to={task.to} state={task.materialId ? { materialId: task.materialId } : {}} className="mt-2 inline-flex min-h-7 items-center rounded-lg bg-[#1a3827] px-3 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-[#254f38] dark:bg-[#1f422e] dark:hover:bg-[#28573d]">
                    {task.action} <span className="ml-1" aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-amber-500/20 bg-white/70 px-4 py-3 text-xs font-medium text-steel-700 dark:border-amber-500/20 dark:bg-white/[0.02] dark:text-amber-200/90">All operations are running smoothly. Nothing needs immediate action.</p>
      )}
    </section>
  );
}

function ProviderActionToolbar() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Link
        to="/app/materials/new"
        className="inline-flex items-center gap-2 rounded-xl bg-[#1a3827] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#254f38] border border-emerald-500/30 dark:bg-[#1f422e] dark:hover:bg-[#28573d]"
      >
        <span className="text-base leading-none text-[#00e599]">+</span>
        Intake New Asset
      </Link>
      <Link
        to="/app/market-demand"
        className="inline-flex items-center gap-2 rounded-xl border border-steel-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-steel-700 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#132218] dark:text-white dark:hover:bg-[#182b1f]"
      >
        <span className="text-sm">🔍</span>
        Browse Buyer Demands
      </Link>
      <Link
        to="/app/deliveries"
        className="inline-flex items-center gap-2 rounded-xl border border-steel-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-steel-700 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#132218] dark:text-white dark:hover:bg-[#182b1f]"
      >
        <span className="text-sm">🚚</span>
        Deliveries &amp; Staging Hub
      </Link>
    </div>
  );
}

function ProviderInventoryCommercialLedger({ dataset }: { dataset: ProviderProps["dataset"] }) {
  const { totalAssetVolumeT, committedVolumeT, committedPercent, unreservedSurplusT, surplusEstimatedValueINR } = useMemo(() => {
    let totalAssetVolumeT = 0;
    let committedVolumeT = 0;
    let unreservedSurplusT = 0;
    let surplusEstimatedValueINR = 0;

    dataset.materials.forEach((m) => {
      if (m.listingStatus === "archived") return;
      const ledger = computeMaterialLedger(m, dataset.bookings, 0, dataset.verifications);
      totalAssetVolumeT += ledger.totalT;
      committedVolumeT += (ledger.committedT + ledger.reservedT);
      unreservedSurplusT += ledger.availableT;
      surplusEstimatedValueINR += (ledger.availableT * (m.pricePerT ?? 0));
    });

    const committedPercent = totalAssetVolumeT > 0 ? Math.round((committedVolumeT / totalAssetVolumeT) * 100) : 0;

    return {
      totalAssetVolumeT: Math.round(totalAssetVolumeT * 10) / 10,
      committedVolumeT: Math.round(committedVolumeT * 10) / 10,
      committedPercent,
      unreservedSurplusT: Math.round(unreservedSurplusT * 10) / 10,
      surplusEstimatedValueINR,
    };
  }, [dataset.materials, dataset.bookings, dataset.verifications]);

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-xs dark:border-steel-800 dark:bg-[#121f16]" aria-label="Commercial Inventory Ledger">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-100 bg-[#f8faf8] px-4 py-3 dark:border-steel-800 dark:bg-[#15251b] sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-[#00e599]/20 text-[#00e599] font-mono text-xs font-bold">
            ₹
          </span>
          <div>
            <h2 className="font-archivo text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
              Live Inventory Commercial Ledger
            </h2>
            <p className="text-[11px] text-steel-500 dark:text-steel-400">
              Chain-of-custody asset volume, allocation commitments, and active market surplus
            </p>
          </div>
        </div>
        <Link
          to="/app/materials"
          className="text-xs font-bold text-loop-700 underline hover:text-loop-800 dark:text-[#B7F34A]"
        >
          View Full Materials Ledger →
        </Link>
      </div>

      <div className="grid grid-cols-1 divide-y divide-steel-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-steel-800">
        <div className="p-4 sm:p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500 dark:text-steel-400">
            Total Surveyed Volume
          </span>
          <p className="mt-1 font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {totalAssetVolumeT.toLocaleString("en-IN")} <span className="text-base font-normal text-steel-400">t</span>
          </p>
          <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">
            Across {dataset.materials.length} active digital passports
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500 dark:text-steel-400">
              Committed in Orders
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
              {committedPercent}% locked
            </span>
          </div>
          <p className="mt-1 font-archivo text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 sm:text-3xl">
            {committedVolumeT.toLocaleString("en-IN")} <span className="text-base font-normal text-steel-400">t</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-steel-100 dark:bg-steel-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.min(100, committedPercent)}%` }}
            />
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500 dark:text-steel-400">
              Active Unreserved Surplus
            </span>
            <span className="rounded-full bg-loop-100 px-2 py-0.5 font-mono text-[10px] font-bold text-loop-800 dark:bg-loop-900/50 dark:text-[#B7F34A]">
              Available
            </span>
          </div>
          <p className="mt-1 font-archivo text-2xl font-bold tracking-tight text-loop-700 dark:text-[#B7F34A] sm:text-3xl">
            {unreservedSurplusT.toLocaleString("en-IN")} <span className="text-base font-normal text-steel-400">t</span>
          </p>
          <p className="mt-1 text-xs font-medium text-steel-600 dark:text-steel-300">
            Est. Market Value: <strong className="text-ink-900 dark:text-white">{formatINR(surplusEstimatedValueINR)}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}

function OperationalPriorityQueue({
  dispatchTasks,
  proposalsTasks,
  gateTasks,
}: {
  dispatchTasks: Array<{ id: string; title: string; subtitle: string; action: string; to: string }>;
  proposalsTasks: Array<{ id: string; title: string; subtitle: string; action: string; to: string }>;
  gateTasks: Array<{ id: string; title: string; subtitle: string; action: string; to: string }>;
}) {
  const totalCount = dispatchTasks.length + proposalsTasks.length + gateTasks.length;

  return (
    <section className="mb-6 rounded-2xl border border-steel-200 bg-white p-4 shadow-xs dark:border-steel-800 dark:bg-[#121f16] sm:p-5" aria-label="Operational Priority Attention Queue">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v4M12 16.5h.01" /></svg>
          </span>
          <div>
            <h2 className="font-archivo text-sm font-bold uppercase tracking-wider text-ink-900 dark:text-white">
              Operational Priority Attention Queue
            </h2>
            <p className="text-xs text-steel-500 dark:text-steel-400">
              Immediate triage for loads, commercial proposals, and gate verifications
            </p>
          </div>
        </div>
        {totalCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/40">
            {totalCount} Action{totalCount === 1 ? "" : "s"} Required
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lane 1: Dispatch Today */}
        <div className="flex flex-col rounded-xl border border-rose-200/80 bg-rose-50/40 p-3.5 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="font-archivo text-xs font-bold uppercase tracking-wider text-rose-950 dark:text-rose-200">
                Dispatch Today
              </h3>
            </div>
            <span className="font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
              {dispatchTasks.length}
            </span>
          </div>
          {dispatchTasks.length > 0 ? (
            <ul className="space-y-2.5">
              {dispatchTasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-rose-200 bg-white p-3 shadow-2xs dark:border-rose-900/40 dark:bg-[#16211a]">
                  <p className="text-xs font-semibold text-ink-900 dark:text-white">{t.title}</p>
                  <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">{t.subtitle}</p>
                  <Link
                    to={t.to}
                    className="mt-2.5 inline-flex min-h-7 items-center rounded-md bg-rose-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-rose-700"
                  >
                    {t.action} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="my-auto text-center py-6 text-xs text-steel-500 dark:text-steel-400">
              ✓ No shipments pending dispatch
            </p>
          )}
        </div>

        {/* Lane 2: Pending Commercial Proposals */}
        <div className="flex flex-col rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              <h3 className="font-archivo text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                Commercial Proposals
              </h3>
            </div>
            <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
              {proposalsTasks.length}
            </span>
          </div>
          {proposalsTasks.length > 0 ? (
            <ul className="space-y-2.5">
              {proposalsTasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-amber-200 bg-white p-3 shadow-2xs dark:border-amber-900/40 dark:bg-[#16211a]">
                  <p className="text-xs font-semibold text-ink-900 dark:text-white">{t.title}</p>
                  <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">{t.subtitle}</p>
                  <Link
                    to={t.to}
                    className="mt-2.5 inline-flex min-h-7 items-center rounded-md bg-[#1a3827] px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-[#254f38] dark:bg-[#1f422e] dark:hover:bg-[#28573d]"
                  >
                    {t.action} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="my-auto text-center py-6 text-xs text-steel-500 dark:text-steel-400">
              ✓ All terms proposals reviewed
            </p>
          )}
        </div>

        {/* Lane 3: Gate Verification Reviews */}
        <div className="flex flex-col rounded-xl border border-blue-200/80 bg-blue-50/40 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-blue-500" />
              <h3 className="font-archivo text-xs font-bold uppercase tracking-wider text-blue-950 dark:text-blue-200">
                Gate Verification Reviews
              </h3>
            </div>
            <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">
              {gateTasks.length}
            </span>
          </div>
          {gateTasks.length > 0 ? (
            <ul className="space-y-2.5">
              {gateTasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-blue-200 bg-white p-3 shadow-2xs dark:border-blue-900/40 dark:bg-[#16211a]">
                  <p className="text-xs font-semibold text-ink-900 dark:text-white">{t.title}</p>
                  <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">{t.subtitle}</p>
                  <Link
                    to={t.to}
                    className="mt-2.5 inline-flex min-h-7 items-center rounded-md bg-blue-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-blue-700"
                  >
                    {t.action} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="my-auto text-center py-6 text-xs text-steel-500 dark:text-steel-400">
              ✓ No pending gate intake reconciliations
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const PROVIDER_KPIS = ["materials", "verified", "dispatch", "bookings"] as const;

function ProviderDashboard() {
  const { dataset, holdBookings, upcomingBookings, dispatchTasks, proposalsTasks, gateTasks } = useProviderDashboardData();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "overview");

  const flowSurveyed = dataset.materials.reduce((total, material) => total + material.quantityT, 0);
  const flowVerified = dataset.verifications.filter((record) => record.status === "verified").reduce((total, record) => total + record.acceptedT, 0);
  const dispatchedBookingIds = new Set(
    dataset.events.filter((event) => event.kind === "load.dispatched").flatMap((event) => event.subjectIds.filter((id) => dataset.bookings.some((booking) => booking.id === id))),
  );
  const dispatchedTotal = dataset.bookings.filter((booking) => dispatchedBookingIds.has(booking.id)).reduce((total, booking) => total + booking.tonnesT, 0);
  const activeBookingCount = dataset.bookings.filter((booking) => booking.status === "confirmed" || booking.status === "hold" || booking.status === "pending").length;
  const activeProject = dataset.projects[0];
  const projectMaterials = dataset.materials.filter((m) => m.projectId === activeProject?.id);
  const capacitySlots = dataset.slots.filter((slot) => slot.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2);
  const receiverName = (id: string) => dataset.receivers.find((r) => r.id === id)?.name ?? id;
  const projectName = (id: string) => dataset.projects.find((p) => p.id === id)?.name ?? id;
  const materialProject = (materialId: string) => dataset.materials.find((m) => m.id === materialId)?.projectId ?? "";
  const typeTotals = new Map<string, number>();
  for (const m of dataset.materials) typeTotals.set(m.type, (typeTotals.get(m.type) ?? 0) + m.quantityT);
  const grandTotal = [...typeTotals.values()].reduce((a, b) => a + b, 0);
  const kpiValues = [flowSurveyed, flowVerified, dispatchedTotal, dataset.bookings.length];

  return (
    <div className="relative min-h-screen pb-20">
      <PageMeta title="Dashboard | GreenLoop" description="Your operational dashboard: attention items, analytics and activity." />
      <DashboardHero
        eyebrow="Dashboard"
        title="Operations Dashboard"
        description="Live view of your material, demand, deliveries and recovery — with the analytics that answer what to do next."
      />

      <div className="mb-6 flex gap-1 rounded-2xl border border-[#e4e0d6] bg-[#f9f8f4] p-1.5 shadow-xs dark:border-steel-800 dark:bg-[#111e16] sm:w-max">
        <button type="button" onClick={() => setActiveTab("overview")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "overview" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Overview</button>
        <button type="button" onClick={() => setActiveTab("bookings")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "bookings" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Bookings</button>
        <button type="button" onClick={() => setActiveTab("deliveries")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "deliveries" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Deliveries</button>
      </div>

      {activeTab === "overview" && (
        <>
          <ProviderActionToolbar />

          <ProviderInventoryCommercialLedger dataset={dataset} />

          <OperationalPriorityQueue
            dispatchTasks={dispatchTasks}
            proposalsTasks={proposalsTasks}
            gateTasks={gateTasks}
          />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operations summary">
        {PROVIDER_KPIS.map((kind, index) => (
          <KpiCard
            key={kind}
            label={["Material surveyed", "Verified recovery", "Dispatched", "Bookings placed"][index]}
            value={kpiValues[index]}
            decimals={index === 3 ? 0 : 1}
            suffix={index === 3 ? "" : " t"}
            hint={[`${dataset.materials.length} live passports`, `${dataset.verifications.length} verifications logged`, "Loads en route or received", `${activeBookingCount} active now`][index]}
            icon={kind}
            positive={kind === "verified"}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-detail lg:grid-cols-2">
        <CompositionChart dataset={dataset} />
        <RecoveryFlowChart dataset={dataset} />
        <ReceiverCapacityChart dataset={dataset} />
        <ProjectRecoveryChart dataset={dataset} />
        <PlannedActualChart dataset={dataset} />
        <CapacityTimelineChart dataset={dataset} />
      </div>

      <AdvancedImpactPanel />

      {activeProject && (
        <section className="mt-4 grid gap-detail lg:grid-cols-[1.45fr_1fr]">
          <article className="overflow-hidden border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
              <div className="min-w-0">
                <p className="eyebrow-label text-steel-500 dark:text-steel-400">Active recovery project</p>
                <h2 className="mt-0.5 truncate font-archivo text-lg font-bold uppercase tracking-tight text-ink-900 dark:text-white sm:text-xl">{activeProject.name}</h2>
              </div>
              <Link to="/app/projects" className="shrink-0 text-xs font-bold uppercase tracking-wide text-loop-800 hover:text-loop-600 dark:text-loop-300 dark:hover:text-loop-200 sm:text-xs">
                View all projects <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="relative mx-4 h-36 overflow-hidden border border-steel-200 sm:mx-5 sm:h-40 dark:border-steel-800">
              <img src={projectMediaFor(activeProject).src} alt={projectMediaFor(activeProject).alt} className="size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#13251b]/80 via-transparent to-transparent" aria-hidden="true" />
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-end justify-between gap-2">
                <span className="border border-white/25 bg-[#17291e]/85 px-2.5 py-1 text-xs font-medium text-white rounded-surface">{activeProject.location}</span>
                <ProjectStatusChip status={activeProject.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-detail px-4 py-3 sm:grid-cols-3 sm:px-5">
              <ProjectMetric label="Surveyed volume" value={`${projectMaterials.reduce((acc, material) => acc + material.quantityT, 0).toFixed(1)} t`} />
              <ProjectMetric label="Material types" value={String(new Set(projectMaterials.map((material) => material.type)).size)} />
              <ProjectMetric label="Passports" value={String(projectMaterials.length)} />
            </div>
          </article>

          <article className="flex flex-col border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="eyebrow-label text-steel-500 dark:text-steel-400">Project workflow</p>
                <h2 className="mt-0.5 font-archivo text-base font-bold uppercase tracking-wide text-ink-900 dark:text-white">Current stage</h2>
              </div>
              <span className="text-xs font-medium text-steel-500 dark:text-steel-400">Live passports</span>
            </div>
            <RecoveryFlow dataset={dataset} />
            <div className="mt-auto border-t border-steel-100 pt-3 dark:border-steel-800">
              <Link to="/app/materials/new" className="inline-flex min-h-10 w-full items-center justify-center gap-2 bg-[#315c3d] px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#254a30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop-600">
                <span aria-hidden="true" className="text-base leading-none">+</span> New Survey
              </Link>
            </div>
          </article>
        </section>
      )}

      <DashboardColumns dataset={dataset} capacitySlots={capacitySlots} holdBookings={holdBookings} upcomingBookings={upcomingBookings} receiverName={receiverName} projectName={projectName} materialProject={materialProject} />

      <MaterialBreakdown typeTotals={typeTotals} grandTotal={grandTotal} />

      <section className="mt-4 border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] sm:p-4 rounded-surface">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Operations log</p>
            <h2 className="mt-0.5 font-archivo text-base font-bold uppercase tracking-wide text-ink-900 dark:text-white">Recent Activity</h2>
          </div>
          <span className="text-xs font-medium text-steel-500 dark:text-steel-400">Latest events</span>
        </div>
        <EventLog events={dataset.events} limit={6} />
      </section>
        </>
      )}

      {activeTab === "bookings" && <Bookings />}
      {activeTab === "deliveries" && <Deliveries />}
    </div>
  );
}

function ProjectMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-s-2 border-steel-200 pl-2.5 dark:border-steel-700">
      <p className="eyebrow-label truncate text-steel-500 dark:text-steel-400">{label}</p>
      <p className="ledger-numeral mt-0.5 truncate text-sm font-bold text-ink-900 dark:text-white">{value}</p>
    </div>
  );
}

function SectionHeading({ title, to, action }: { title: string; to: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-archivo text-sm font-bold uppercase tracking-wide text-ink-900 dark:text-white">{title}</h2>
      <Link to={to} className="shrink-0 text-xs font-bold uppercase tracking-wide text-loop-800 hover:text-loop-600 dark:text-loop-300 dark:hover:text-loop-200 sm:text-xs">
        {action} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function DashboardColumns({
  dataset,
  capacitySlots,
  holdBookings,
  upcomingBookings,
  receiverName,
  projectName,
  materialProject,
}: {
  dataset: ProviderProps["dataset"];
  capacitySlots: ProviderProps["dataset"]["slots"];
  holdBookings: ProviderProps["dataset"]["bookings"];
  upcomingBookings: ProviderProps["dataset"]["bookings"];
  receiverName: (id: string) => string;
  projectName: (id: string) => string;
  materialProject: (materialId: string) => string;
}) {
  const materialName = (id: string) => materialTypeLabel(dataset.materials.find((m) => m.id === id)?.type ?? "");
  return (
    <div className="mt-4 grid grid-cols-1 gap-detail xl:grid-cols-[1fr_1.2fr_1fr]">
      <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
        <SectionHeading title="Recent Passports" to="/app/materials" action="All materials" />
        <ul className="mt-3 space-y-2">
          {dataset.materials.slice(0, 3).map((material) => {
            const media = materialMedia(material);
            return (
              <li key={material.id}>
                <Link to={`/app/materials/${material.id}`} className="group flex min-w-0 items-center gap-2.5 border border-steel-200 p-2 transition-colors hover:border-loop-500 dark:border-steel-800 dark:hover:border-loop-500">
                  <span className="size-11 shrink-0 overflow-hidden border border-steel-200 bg-steel-100 dark:border-steel-800 dark:bg-steel-900">
                    {media[0] ? <img src={media[0].src} className="size-full object-cover" alt={media[0].caption} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-archivo text-xs font-bold uppercase text-ink-900 dark:text-white">{materialTypeLabel(material.type)}</span>
                    <span className="mt-0.5 block text-xs text-steel-600 dark:text-steel-400"><span className="ledger-numeral font-semibold text-ink-900 dark:text-gray-200">{material.quantityT.toFixed(1)} t</span> · <span className="capitalize">{material.condition}</span></span>
                  </span>
                  <StatusBadge status={material.status} />
                  <span className="text-steel-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
                </Link>
              </li>
            );
          })}
          {dataset.materials.length === 0 && <li className="border border-dashed border-steel-300 px-3 py-6 text-center text-xs text-steel-500 dark:border-steel-700">No material passports recorded.</li>}
        </ul>
      </section>

      <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
        <SectionHeading title="Network Capacity" to="/app/market-demand?view=receivers" action="Find receivers" />
        <p className="mt-1 text-xs text-steel-600 dark:text-steel-400">Real-time receiving capacity for tracked facilities.</p>
        <div className="mt-3">
          {capacitySlots.length > 0 ? (
            <div className="mt-2 space-y-3">
              {capacitySlots.map((slot) => {
                const ledger = slotLedger(dataset, slot.id);
                if (!ledger) return null;
                return <div key={slot.id} className="border border-steel-100 p-2.5 dark:border-steel-800">
                  <h3 className="text-xs font-bold text-ink-900 dark:text-white">{receiverName(slot.receiverId)}</h3>
                  <div className="mb-2 mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink-900 dark:text-white/90">{formatDate(slot.date)} intake</p>
                    <Badge color={ledger.available > 0 ? "success" : "warning"} size="sm">{ledger.available.toFixed(1)} t</Badge>
                  </div>
                  <CapacityBar capacityT={slot.capacityT} reservedT={ledger.reserved} heldT={ledger.heldT} />
                </div>;
              })}
            </div>
          ) : (
            <p className="border border-dashed border-steel-300 px-3 py-6 text-center text-xs text-steel-500 dark:border-steel-700">No capacity slots available.</p>
          )}
        </div>
        {holdBookings.length > 0 && (
          <div className="mt-3 border-s-2 border-amber-500 bg-amber-50 px-3 py-2 dark:bg-amber-900/10">
            <p className="eyebrow-label text-amber-700 dark:text-amber-300">On hold due to capacity</p>
            <p className="mt-1 text-xs font-semibold text-ink-900 dark:text-amber-100">{holdBookings[0].tonnesT.toFixed(1)} t {materialName(holdBookings[0].materialId)}</p>
            <Link to="/app/bookings" className="mt-1 inline-flex text-xs font-bold uppercase tracking-wide text-ink-900 underline underline-offset-2 dark:text-white">Manage booking</Link>
          </div>
        )}
      </section>

      <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
        <SectionHeading title="Upcoming Deliveries" to="/app/deliveries" action="All deliveries" />
        <ul className="mt-3 space-y-2">
          {upcomingBookings.slice(0, 3).map((booking) => {
            const material = dataset.materials.find((item) => item.id === booking.materialId);
            const media = material ? materialMedia(material) : [];
            return (
              <li key={booking.id} className="flex items-center gap-2.5 border border-steel-200 p-2 dark:border-steel-800">
                <span className="size-11 shrink-0 overflow-hidden border border-steel-200 bg-steel-100 dark:border-steel-800 dark:bg-steel-900">
                  {media[0] ? <img src={media[0].src} className="size-full object-cover" alt={media[0].caption} /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-steel-500 dark:text-steel-400">{projectName(materialProject(booking.materialId))}</p>
                  <p className="truncate text-xs font-bold text-ink-900 dark:text-white">{booking.tonnesT.toFixed(1)} t {materialName(booking.materialId)}</p>
                  <p className="mt-0.5 truncate text-xs text-steel-600 dark:text-steel-400">To: {receiverName(booking.receiverId)} · {booking.slotId}</p>
                </div>
                <StatusBadge status={booking.status} />
              </li>
            );
          })}
          {upcomingBookings.length === 0 && (
            <li className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#ccd6ce] bg-[#fbfbfa]/70 px-4 py-8 text-center dark:border-steel-800 dark:bg-white/[0.02]">
              <span className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[#1e4631] dark:text-[#00e599]">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
              </span>
              <p className="mt-2 text-xs font-semibold text-ink-900 dark:text-white">No upcoming deliveries scheduled</p>
              <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">Loads will appear here once bookings are confirmed.</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function MaterialBreakdown({ typeTotals, grandTotal }: { typeTotals: Map<string, number>; grandTotal: number }) {
  if (typeTotals.size === 0) return null;
  const rows = [...typeTotals.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <section className="mt-6" aria-label="Material breakdown">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel-200 pb-4 dark:border-steel-800">
        <div>
          <h2 className="font-archivo text-lg font-bold tracking-tight text-ink-900 dark:text-white">Material in the system</h2>
          <p className="mt-1 text-sm text-steel-500 dark:text-gray-400">Live tonnage by type — every tile links to the passport library.</p>
        </div>
        <p className="ledger-numeral text-2xl font-bold text-ink-900 dark:text-white">{grandTotal.toFixed(1)} t</p>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-detail sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(([type, tonnes]) => {
          const media = materialMediaFor(type);
          return (
            <li key={type}>
              <Link to="/app/materials" className="group block">
                <MediaPanel media={media} aspect="aspect-[4/3]" caption={materialTypeLabel(type)} />
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-archivo text-sm font-bold capitalize text-ink-900 dark:text-white">{materialTypeLabel(type)}</span>
                  <span className="ledger-numeral text-sm font-bold text-steel-600 dark:text-gray-400">{tonnes.toFixed(1)} t</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const RECEIVER_KPIS = ["materials", "verified", "dispatch", "bookings"] as const;

function useReceiverDashboardData() {
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  return useMemo(() => {
    const receiverId = user?.receiverId ?? "";
    const myDemands = dataset.demands.filter((demand) => demand.receiverId === receiverId);
    const openDemands = myDemands.filter((demand) => demand.status === "OPEN" || demand.status === "PARTIALLY_COVERED");
    const pendingOffers = (dataset.offers ?? []).filter((offer) => offer.status === "pending" && myDemands.some((demand) => demand.id === offer.demandId));
    const futureSlots = dataset.slots.filter((slot) => slot.receiverId === receiverId && slot.date >= new Date().toISOString().slice(0, 10));
    const capacityAvailableT = futureSlots.reduce((total, slot) => total + (slotLedger(dataset, slot.id)?.available ?? 0), 0);
    const acceptedT = dataset.verifications.filter((record) => record.receiverId === receiverId && record.status === "verified").reduce((total, record) => total + record.acceptedT, 0);
    const upcomingDeliveries = dataset.bookings.filter((booking) => booking.receiverId === receiverId && booking.status !== "cancelled").slice(0, 6);
    const readyToReceive = upcomingDeliveries.filter((booking) => booking.status === "confirmed" && dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id)));
    const holdsOnCapacity = upcomingDeliveries.filter((booking) => booking.status === "hold");
    const pendingVerifications = dataset.verifications.filter((record) => record.receiverId === receiverId && record.status === "pending");
    const attentionTasks = [
      ...pendingOffers.map((offer) => ({ id: offer.id, title: `${offer.offeredQuantityT.toFixed(1)} t offer is waiting for your decision`, action: "Review offer", to: `/app/receiver/demand?demand=${encodeURIComponent(offer.demandId)}` })),
      ...readyToReceive.map((booking) => ({ id: booking.id, title: `${booking.tonnesT.toFixed(1)} t load is on its way`, action: "Track delivery", to: "/app/receiver/deliveries" })),
      ...holdsOnCapacity.map((booking) => ({ id: booking.id, title: `${booking.tonnesT.toFixed(1)} t request is waiting on capacity`, action: "Add capacity", to: "/app/receiver/demand?capacity=1" })),
      ...pendingVerifications.map((record) => ({ id: record.id, title: `Weighbridge check for ${record.loadRef ?? "a load"} is incomplete`, action: "Check & accept", to: "/app/receiver/verification" })),
    ];
    return { dataset, myDemands, openDemands, pendingOffers, capacityAvailableT, acceptedT, upcomingDeliveries, attentionTasks };
  }, [dataset, user?.receiverId]);
}

function ReceiverDashboard() {
  const { dataset, myDemands, openDemands, pendingOffers, capacityAvailableT, acceptedT, upcomingDeliveries, attentionTasks } = useReceiverDashboardData();
  const receiverId = useReceiverId();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "overview");
  const kpiValues = [openDemands.length, pendingOffers.length, capacityAvailableT, acceptedT];

  return (
    <div className="relative min-h-screen pb-20">
      <PageMeta title="Dashboard | GreenLoop" description="Your receiver operations dashboard: requests, offers, capacity and deliveries." />
      <DashboardHero
        eyebrow="Dashboard"
        title="Receiving Dashboard"
        description="Requests, incoming offers, capacity and verified recovery for your facility — in one operational view."
      />

      <div className="mb-6 flex gap-1 rounded-2xl border border-[#e4e0d6] bg-[#f9f8f4] p-1.5 shadow-xs dark:border-steel-800 dark:bg-[#111e16] sm:w-max">
        <button type="button" onClick={() => setActiveTab("overview")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "overview" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Overview</button>
        <button type="button" onClick={() => setActiveTab("bookings")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "bookings" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Bookings</button>
        <button type="button" onClick={() => setActiveTab("deliveries")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none ${activeTab === "deliveries" ? "bg-[#1f422e] text-white shadow-sm border border-emerald-500/20" : "text-steel-600 hover:text-ink-900 hover:bg-white/60 dark:text-steel-400 dark:hover:text-white dark:hover:bg-white/5"}`}>Deliveries</button>
      </div>

      {activeTab === "overview" && (
        <>
          <NeedsAttention tasks={attentionTasks} dataset={dataset} />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Receiving summary">
        {RECEIVER_KPIS.map((kind, index) => (
          <KpiCard
            key={kind}
            label={["Open requests", "Incoming offers", "Receiving capacity free", "Verified recovery"][index]}
            value={kpiValues[index]}
            decimals={index >= 2 ? 1 : 0}
            suffix={index >= 2 ? " t" : ""}
            hint={[`${myDemands.length} requests total`, "Offers waiting on a decision", "Across your upcoming slots", `${dataset.verifications.length} verifications logged`][index]}
            icon={kind}
            positive={index === 3}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-detail lg:grid-cols-2">
        <RecoveryFlowChart dataset={dataset} />
        <CompositionChart dataset={dataset} />
        <ReceiverCapacityChart dataset={dataset} />
        <ProjectRecoveryChart dataset={dataset} />
        <PlannedActualChart dataset={dataset} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-detail xl:grid-cols-3">
        <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <SectionHeading title="My Material Requests" to="/app/receiver/demand" action="Request material" />
          <ul className="mt-3 space-y-2">
            {openDemands.slice(0, 3).map((demand) => {
              const coveredT = dataset.bookings.filter((booking) => booking.demandId === demand.id && booking.status === "confirmed").reduce((sum, booking) => sum + booking.tonnesT, 0);
              return (
                <li key={demand.id}>
                  <Link to={`/app/receiver/demand?demand=${encodeURIComponent(demand.id)}`} className="group flex min-w-0 items-center gap-2.5 border border-steel-200 p-2 transition-colors hover:border-loop-500 dark:border-steel-800 dark:hover:border-loop-500">
                    <span className="size-11 shrink-0 overflow-hidden border border-steel-200 bg-steel-100 dark:border-steel-800 dark:bg-steel-900">
                      <img src={materialMediaFor(demand.materialType).src} alt={materialMediaFor(demand.materialType).alt} className="size-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-archivo text-xs font-bold uppercase text-ink-900 dark:text-white">{materialTypeLabel(demand.materialType)}</span>
                      <span className="mt-0.5 block text-xs text-steel-600 dark:text-steel-400"><span className="ledger-numeral font-semibold text-ink-900 dark:text-gray-200">{coveredT.toFixed(1)}</span> of {demand.requiredT.toFixed(1)} t covered · {formatDate(demand.period)}</span>
                    </span>
                    <StatusBadge status={demand.status} />
                  </Link>
                </li>
              );
            })}
            {openDemands.length === 0 && (
              <li className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#ccd6ce] bg-[#fbfbfa]/70 px-4 py-8 text-center dark:border-steel-800 dark:bg-white/[0.02]">
                <span className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[#1e4631] dark:text-[#00e599]">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 4h14v16H5z" /><path d="M8 8h8m-8 4h8m-8 4h5" /></svg>
                </span>
                <p className="mt-2 text-xs font-semibold text-ink-900 dark:text-white">No open material requests</p>
                <p className="mt-0.5 text-[11px] text-steel-500 dark:text-steel-400">Publish a new demand from the Request Material section.</p>
              </li>
            )}
          </ul>
        </section>

        <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <SectionHeading title="Receiving Capacity" to="/app/receiver/demand?capacity=1" action="Manage capacity" />
          <div className="mt-3 space-y-3">
            {dataset.slots.filter((slot) => slot.receiverId === receiverId).slice(0, 3).map((slot) => {
              const ledger = slotLedger(dataset, slot.id);
              if (!ledger) return null;
              return (
                <div key={slot.id} className="border border-steel-100 p-2.5 dark:border-steel-800">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{materialTypeLabel(slot.materialType)} · {formatDate(slot.date)}</p>
                    <Badge color={ledger.available > 0 ? "success" : "warning"} size="sm">{ledger.available.toFixed(1)} t free</Badge>
                  </div>
                  <CapacityBar capacityT={slot.capacityT} reservedT={ledger.reserved} heldT={ledger.heldT} />
                </div>
              );
            })}
            {dataset.slots.filter((slot) => slot.receiverId === receiverId).length === 0 && <p className="border border-dashed border-steel-300 px-3 py-6 text-center text-xs text-steel-500 dark:border-steel-700">No capacity scheduled — add intake to accept offers.</p>}
          </div>
        </section>

        <section className="border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <SectionHeading title="Upcoming Deliveries" to="/app/receiver/deliveries" action="All deliveries" />
          <ul className="mt-3 space-y-2">
            {upcomingDeliveries.slice(0, 3).map((booking) => {
              const material = dataset.materials.find((item) => item.id === booking.materialId);
              return (
                <li key={booking.id} className="flex items-center gap-2.5 border border-steel-200 p-2 dark:border-steel-800">
                  <span className="size-11 shrink-0 overflow-hidden border border-steel-200 bg-steel-100 dark:border-steel-800 dark:bg-steel-900">
                    <img src={materialMediaFor(material?.type ?? "").src} alt={materialMediaFor(material?.type ?? "").alt} className="size-full object-cover" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-ink-900 dark:text-white">{booking.tonnesT.toFixed(1)} t {materialTypeLabel(material?.type ?? "")}</p>
                    <p className="mt-0.5 truncate text-xs text-steel-600 dark:text-steel-400">Slot {booking.slotId}</p>
                  </div>
                  <StatusBadge status={booking.status} />
                </li>
              );
            })}
            {upcomingDeliveries.length === 0 && <li className="border border-dashed border-steel-300 px-3 py-6 text-center text-xs text-steel-500 dark:border-steel-700">No upcoming deliveries.</li>}
          </ul>
        </section>
      </div>

      <section className="mt-4 border border-[#e5e1d8] bg-white p-3.5 dark:border-steel-800 dark:bg-white/[0.02] sm:p-4 rounded-surface">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Operations log</p>
            <h2 className="mt-0.5 font-archivo text-base font-bold uppercase tracking-wide text-ink-900 dark:text-white">Recent Activity</h2>
          </div>
          <span className="text-xs font-medium text-steel-500 dark:text-steel-400">Latest events</span>
        </div>
        <EventLog events={dataset.events} limit={6} />
      </section>
        </>
      )}

      {activeTab === "bookings" && <Bookings />}
      {activeTab === "deliveries" && <ReceiverDeliveriesPage />}
    </div>
  );
}

function useReceiverId() {
  const { user } = useAuth();
  return user?.receiverId ?? "";
}
