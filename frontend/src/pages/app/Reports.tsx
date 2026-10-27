import PageMeta from "@/components/common/PageMeta";
import { MediaPanel } from "@/components/greenloop/kit";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { recoveryFlowTotals as computeFlow, receiverCapacityTotals } from "@shared/domain/metrics";
import type { GreenLoopDataset } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn } from "@/utils";
import { motion } from "motion/react";
import { Link } from "react-router";
import { FLOW_STAGES, TYPE_COLORS, useCountUp, type TimelineStep } from "./Reports.helpers";
import AdvancedImpactPanel from "@/components/monetization/AdvancedImpactPanel";

export default function Reports() {
  const { dataset } = useGreenLoopStore();

  const flow = computeFlow(dataset);
  const typeTotals = new Map<string, number>();
  for (const m of dataset.materials) typeTotals.set(m.type, (typeTotals.get(m.type) ?? 0) + m.quantityT);
  const typeRows = [...typeTotals.entries()].sort((a, b) => b[1] - a[1]);
  const grandTotal = typeRows.reduce((s, [, t]) => s + t, 0);
  const activeBookingCount = dataset.bookings.filter((b) => b.status === "confirmed" || b.status === "hold" || b.status === "pending").length;

  return (
    <div className="relative min-h-screen pb-24">
      <PageMeta
        title="Reports | GreenLoop"
        description="Six charts answering real operational questions."
      />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative mb-4 min-h-40 overflow-hidden border border-[#e5e1d8] bg-[#17291e] sm:min-h-44 dark:border-steel-800 rounded-surface"
      >
        <img src={ambientMedia.sortingFacility.src} alt={ambientMedia.sortingFacility.alt} className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17291e]/95 via-[#17291e]/75 to-[#17291e]/20" aria-hidden="true" />
        <div className="relative flex min-h-40 max-w-3xl flex-col justify-end px-5 py-5 text-white sm:min-h-44 sm:px-7 sm:py-6">
          <p className="eyebrow-label text-loop-300">GreenLoop intelligence</p>
          <h1 className="mt-1 font-archivo font-bold tracking-tight gl-page-title">System Analytics</h1>
        </div>
      </motion.header>

      <div className="mb-4 overflow-x-auto border border-[#e5e1d8] bg-white px-4 py-3 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
        <ol className="flex min-w-[650px] items-center gap-3 sm:min-w-0" aria-label="Recovery process">
          {FLOW_STAGES.map((stage, index) => {
            const stageValues = [flow.surveyed, flow.matched, flow.reserved, flow.dispatched, flow.verified];
            const supported = stageValues[index] > 0;
            return (
              <motion.li
                key={stage}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.25 }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <div className="flex shrink-0 flex-col">
                  <span className="ledger-numeral text-xs font-bold text-steel-400 dark:text-steel-500">0{index + 1}</span>
                  <span className={cn("font-archivo text-xs font-bold uppercase tracking-wider sm:text-xs", supported ? "text-loop-800 dark:text-loop-400" : "text-steel-400 dark:text-steel-600")}>{stage}</span>
                </div>
                {index < FLOW_STAGES.length - 1 && <span aria-hidden="true" className={cn("h-px min-w-3 flex-1", supported ? "bg-loop-300 dark:bg-loop-800" : "bg-steel-200 dark:bg-steel-700")} />}
              </motion.li>
            );
          })}
        </ol>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard label="Material surveyed" value={flow.surveyed} suffix=" t" hint={`${dataset.materials.length} live passports`} icon="materials" />
        <KpiCard label="Verified recovery" value={flow.verified} suffix=" t" hint={`${dataset.verifications.length} verifications logged`} icon="verified" positive />
        <KpiCard label="Dispatched" value={flow.dispatched} suffix=" t" hint="Loads en route or received" icon="dispatch" />
        <KpiCard label="Bookings placed" value={dataset.bookings.length} decimals={0} hint={`${activeBookingCount} active now`} icon="bookings" />
      </motion.div>

      <div className="grid grid-cols-1 gap-detail lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 }}>
          <CompositionChart dataset={dataset} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
          <RecoveryFlowChart dataset={dataset} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 }}>
          <ReceiverCapacityChart dataset={dataset} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
          <ProjectRecoveryChart dataset={dataset} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 }}>
          <PlannedActualChart dataset={dataset} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
          <CapacityTimelineChart dataset={dataset} />
        </motion.div>
      </div>

      <AdvancedImpactPanel />

      {/* Material-breakdown media strip */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-section"
        aria-label="Material breakdown"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel-200 pb-5 dark:border-steel-800">
          <div>
            <h2 className="font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">Material in the system</h2>
            <p className="mt-1 text-sm text-steel-500 dark:text-gray-400">Live tonnage by type — every tile links to the passport library.</p>
          </div>
          <p className="ledger-numeral text-2xl font-bold text-ink-900 dark:text-white">{grandTotal.toFixed(1)} t</p>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-detail sm:grid-cols-3 lg:grid-cols-6">
          {typeRows.map(([type, t]) => {
            const media = materialMediaFor(type);
            return (
              <li key={type}>
                <Link to="/app/materials" className="group block">
                  <MediaPanel media={media} aspect="aspect-[4/3]" caption={type} />
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="font-archivo text-sm font-bold capitalize text-ink-900 dark:text-white">{type}</span>
                    <span className="ledger-numeral text-sm font-bold text-steel-600 dark:text-gray-400">{t.toFixed(1)} t</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </motion.section>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  suffix = "",
  decimals = 1,
  hint,
  icon,
  positive = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  hint: string;
  icon: "materials" | "verified" | "dispatch" | "bookings";
  positive?: boolean;
}) {
  const animatedValue = useCountUp(value);
  return (
    <section
      className={cn(
        "flex min-w-0 items-center gap-3.5 rounded-2xl border p-4 transition-all duration-200 hover:shadow-md",
        positive
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 shadow-xs dark:border-emerald-500/30 dark:bg-gradient-to-br dark:from-[#132a1e]/80 dark:to-[#0c1811]/90"
          : "border-[#e4e0d6] bg-white shadow-xs dark:border-steel-800 dark:bg-[#111e16]/60"
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl border shadow-2xs",
          positive
            ? "border-emerald-500/30 bg-emerald-500/15 text-[#1b4e33] dark:border-emerald-400/30 dark:bg-emerald-500/20 dark:text-[#00e599]"
            : "border-emerald-950/15 bg-[#173022]/10 text-[#1a3d29] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#c4d8ca]"
        )}
      >
        <MetricIcon kind={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-archivo text-xs font-semibold uppercase tracking-wider text-steel-500 dark:text-steel-400 truncate">{label}</p>
        <p className={cn("font-archivo text-2xl font-bold tracking-tight leading-tight mt-0.5", positive ? "text-emerald-900 dark:text-emerald-300" : "text-ink-900 dark:text-white")}>
          {animatedValue.toFixed(decimals)}{suffix}
        </p>
        <p className="mt-1 truncate text-xs font-medium text-steel-500 dark:text-gray-400">{hint}</p>
      </div>
    </section>
  );
}

export function MetricIcon({ kind }: { kind: "materials" | "verified" | "dispatch" | "bookings" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {kind === "materials" && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.3 7.6 7.7 4.3 7.7-4.3M12 12v9" /></>}
      {kind === "verified" && <><path d="M12 3 20 6v5.5c0 4.6-3.1 7.8-8 9.5-4.9-1.7-8-4.9-8-9.5V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>}
      {kind === "dispatch" && <><path d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></>}
      {kind === "bookings" && <><path d="M6 3.5h12v17H6zM9 7.5h6M9 11.5h6M9 15.5h3" /><path d="M9 3.5v-1M15 3.5v-1" /></>}
    </svg>
  );
}

export function CompositionChart({ dataset }: { dataset: GreenLoopDataset }) {
  const totals = new Map<string, number>();
  for (const m of dataset.materials) {
    totals.set(m.type, (totals.get(m.type) ?? 0) + m.quantityT);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const animatedGrand = useCountUp(grand);

  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="What materials do we have?"
        note="Surveyed tonnage by material type across all projects."
        figure={`${animatedGrand.toFixed(1)} t`}
      />
      <div className="mt-5 space-y-3">
        {rows.map(([type, t], i) => {
          const pct = (t / grand) * 100;
          return (
            <div key={type} className="group flex items-center gap-2.5">
              <span className="w-24 shrink-0 font-archivo text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white sm:w-28 sm:text-xs">{type}</span>
              <div className="h-4 grow overflow-hidden bg-steel-100 dark:bg-steel-900">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                  viewport={{ once: true }}
                  className={cn("h-full", TYPE_COLORS[type] ?? "bg-steel-400")}
                />
              </div>
              <span className="ledger-numeral w-16 shrink-0 text-right text-sm font-bold text-ink-900 dark:text-white sm:text-base">
                {t.toFixed(1)} <span className="text-sm text-steel-400">t</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RecoveryFlowChart({ dataset }: { dataset: GreenLoopDataset }) {
  const flow = computeFlow(dataset);
  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="Where is material in the process?"
        note="Tonnage at each lifecycle stage right now."
        figure={`${flow.surveyed.toFixed(1)} t surveyed`}
      />
      <div className="mt-6 flex h-52 items-end gap-2 sm:gap-4" aria-label="Recovery flow">
        {FLOW_STAGES.map((stage, i) => {
          const t = flow[stage.toLowerCase() as keyof typeof flow] as number;
          const max = flow.surveyed || 1;
          const hPct = Math.max(2, (t / max) * 100);
          return (
            <div key={stage} className="group relative flex h-full flex-1 flex-col items-center justify-end perspective-1000">
              <span className="ledger-numeral mb-2 text-xs font-bold text-ink-900 dark:text-white sm:text-sm">
                {t.toFixed(1)} t
              </span>
              <div className="relative mb-3 flex w-full flex-1 flex-col justify-end border-x border-t border-steel-100 bg-steel-50/60 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: `${hPct}%` }}
                  transition={{ duration: 1.5, type: "spring", bounce: 0.2, delay: i * 0.15 }}
                  viewport={{ once: true }}
                  className={cn(
                    "relative w-full overflow-hidden transition-[height] duration-300",
                    i === FLOW_STAGES.length - 1 ? "bg-loop-600 dark:bg-loop-500" : "bg-loop-950 dark:bg-steel-500"
                  )}
                >
                </motion.div>
              </div>
              <span className="text-center text-xs font-bold uppercase tracking-wider text-steel-500 dark:text-gray-400">{stage}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ReceiverCapacityChart({ dataset }: { dataset: GreenLoopDataset }) {
  const totals = receiverCapacityTotals(dataset);
  const max = Math.max(...totals.map((t) => t.capacity), 1);

  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="Where can this material go?"
        note="Current receiving capacity, reserved vs available."
        figure={`${totals.reduce((s, t) => s + t.available, 0).toFixed(1)} t free`}
      />
      <div className="mt-5 space-y-4">
        {totals.map((t, i) => {
          const reservedPct = (t.reserved / max) * 100;
          const availablePct = (t.available / max) * 100;
          return (
            <div key={t.name}>
              <div className="flex items-baseline justify-between">
                <span className="font-archivo text-sm font-bold text-ink-900 dark:text-white">{t.name}</span>
                <span className="ledger-numeral text-xs font-medium text-steel-500 dark:text-gray-400">
                  <span className="text-ink-900 dark:text-gray-200">{t.reserved.toFixed(1)} t</span> reserved · {t.available.toFixed(1)} t free
                </span>
              </div>
              <div className="mt-2 flex h-3 w-full overflow-hidden bg-steel-100 dark:bg-steel-900">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${reservedPct}%` }}
                  transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                  viewport={{ once: true }}
                  className="h-full bg-loop-600 dark:bg-loop-500"
                />
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${availablePct}%` }}
                  transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                  viewport={{ once: true }}
                  className="h-full bg-steel-300 dark:bg-steel-700"
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-steel-500 dark:text-gray-400">
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-loop-500" /> Reserved</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-steel-300 dark:bg-steel-700" /> Free</span>
      </div>
    </section>
  );
}

export function ProjectRecoveryChart({ dataset }: { dataset: GreenLoopDataset }) {
  const rows = dataset.projects.map((p) => {
    const surveyed = dataset.materials.filter((m) => m.projectId === p.id).reduce((s, m) => s + m.quantityT, 0);
    const verified = dataset.verifications
      .filter((v) => {
        const material = dataset.materials.find((m) => m.id === v.materialId);
        return material?.projectId === p.id;
      })
      .reduce((s, v) => s + v.acceptedT, 0);
    return { name: p.name, surveyed, verified };
  });
  const max = Math.max(...rows.map((r) => r.surveyed), 1);

  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="How are projects progressing?"
        note="Surveyed tonnage vs verified recovery per project."
        figure={`${rows.filter((r) => r.verified > 0).length} verifying`}
      />
      <div className="mt-5 space-y-4">
        {rows.map((r, i) => (
          <div key={r.name}>
            <div className="flex items-baseline justify-between">
              <span className="font-archivo text-sm font-bold text-ink-900 dark:text-white">{r.name}</span>
              <span className="ledger-numeral text-xs font-medium text-steel-500 dark:text-gray-400">
                <span className="text-loop-600 dark:text-loop-400">{r.verified.toFixed(1)} t</span> / {r.surveyed.toFixed(1)} t
              </span>
            </div>
            <div className="relative mt-2 h-3 w-full overflow-hidden bg-steel-100 dark:bg-steel-900">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(r.surveyed / max) * 100}%` }}
                transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                viewport={{ once: true }}
                className="h-full bg-steel-300 dark:bg-steel-700"
              />
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(r.verified / max) * 100}%` }}
                transition={{ duration: 1, delay: i * 0.1 + 0.2, ease: "easeOut" }}
                viewport={{ once: true }}
                className="absolute inset-y-0 left-0 h-full bg-loop-600 dark:bg-loop-500"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-steel-500 dark:text-gray-400">
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-steel-300 dark:bg-steel-700" /> Surveyed</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-loop-500" /> Verified</span>
      </div>
    </section>
  );
}

export function PlannedActualChart({ dataset }: { dataset: GreenLoopDataset }) {
  const v = dataset.verifications[0];
  const planned = useCountUp(v?.plannedT ?? 0);
  const actual = useCountUp(v?.actualT ?? 0);
  const accepted = useCountUp(v?.acceptedT ?? 0);
  const rejected = useCountUp(v?.rejectedT ?? 0);
  if (!v) return null;
  const max = v.plannedT || 1;

  const rows = [
    { label: "Planned", value: planned, cls: "bg-steel-400 dark:bg-steel-600" },
    { label: "Actual", value: actual, cls: "bg-ink-900 dark:bg-white" },
    { label: "Accepted", value: accepted, cls: "bg-loop-600 dark:bg-loop-500" },
    { label: "Rejected", value: rejected, cls: "bg-signal-500" },
  ];

  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="What actually arrived?"
        note={`${v.loadRef} at ${dataset.receivers.find((r) => r.id === v.receiverId)?.name}.`}
        figure={`${Math.round((v.acceptedT / v.plannedT) * 100)}% accepted`}
      />
      <div className="mt-5 space-y-3">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 font-archivo text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-gray-200 sm:w-24 sm:text-sm">{r.label}</span>
            <div className="h-4 grow overflow-hidden bg-steel-100 dark:bg-steel-900">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(r.value / max) * 100}%` }}
                transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                viewport={{ once: true }}
                className={cn("h-full", r.cls)}
              />
            </div>
            <span className="ledger-numeral w-14 shrink-0 text-right text-sm font-bold text-ink-900 dark:text-white sm:text-base">
              {r.value.toFixed(1)} <span className="text-sm text-steel-400">t</span>
            </span>
          </div>
        ))}
      </div>
      {v.rejectReason && (
        <div className="mt-6 border-l-4 border-signal-500 bg-signal-50 p-4 dark:bg-signal-500/10">
          <p className="text-xs font-bold uppercase tracking-wider text-signal-900 dark:text-signal-100">Rejection Note</p>
          <p className="mt-1 text-sm text-signal-800 dark:text-signal-200">{v.rejectReason}</p>
        </div>
      )}
    </section>
  );
}

export function CapacityTimelineChart({ dataset }: { dataset: GreenLoopDataset }) {
  const story = dataset.bookings;
  const slot = dataset.slots.find((s) => s.id === "SL-R1-CONC-0924");
  const capacity = slot?.capacityT ?? 15;
  const a = story.find((b) => b.id === "BK-1");
  const b = story.find((b) => b.id === "BK-2");

  const steps: TimelineStep[] = [
    { time: "09:05", label: "Project A books 10.0 t — confirmed", availableT: capacity - (a?.tonnesT ?? 10), tone: "confirmed" },
    { time: "09:40", label: "Project B requests 8.0 t — HOLD", availableT: capacity - (a?.tonnesT ?? 10), tone: "hold" },
    { time: "10:15", label: "Project A cancels — 10.0 t released", availableT: capacity, tone: "released" },
    { time: "10:15", label: "Recheck — Project B 8.0 t confirmed", availableT: capacity - (b?.tonnesT ?? 8), tone: "recheck" },
  ];

  return (
    <section className="h-full border border-[#e5e1d8] bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
      <ChartHeader
        question="How does the ledger resolve conflicts?"
        note={`Riverstone Aggregates ${capacity.toFixed(0)} t concrete slot — receiving capacity timeline.`}
        figure={`${steps[steps.length - 1].availableT.toFixed(1)} t final free`}
      />
      <div className="mt-5 space-y-4">
        {steps.map((s, i) => {
          const usedPct = ((capacity - s.availableT) / capacity) * 100;
          return (
            <div key={i} className="flex items-center gap-4">
              <span className="ledger-numeral w-12 shrink-0 text-sm font-bold text-steel-500 dark:text-gray-400">{s.time}</span>
              <div className="grow">
                <p className="text-sm font-medium text-ink-900 dark:text-gray-200">{s.label}</p>
                <div className="mt-2 h-3 w-full overflow-hidden bg-steel-100 dark:bg-steel-900">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${usedPct}%` }}
                    transition={{ duration: 1, delay: i * 0.15, ease: "easeOut" }}
                    viewport={{ once: true }}
                    className={cn(
                      "h-full",
                      s.tone === "hold" ? "bg-signal-500" : s.tone === "released" ? "bg-steel-300 dark:bg-steel-600" : s.tone === "recheck" ? "bg-loop-500" : "bg-ink-900 dark:bg-white"
                    )}
                  />
                </div>
              </div>
              <span className="ledger-numeral w-16 shrink-0 text-right text-sm font-bold text-ink-900 dark:text-gray-200">
                {s.availableT.toFixed(1)} <span className="text-steel-400">t</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ChartHeader({ question, note, figure }: { question: string; note: string; figure: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel-200 pb-5 dark:border-steel-800">
      <div>
        <h2 className="font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">{question}</h2>
        <p className="mt-0.5 text-xs text-steel-500 dark:text-gray-400">{note}</p>
      </div>
      <p className="ledger-numeral text-xl font-bold text-ink-900 dark:text-white">{figure}</p>
    </div>
  );
}
