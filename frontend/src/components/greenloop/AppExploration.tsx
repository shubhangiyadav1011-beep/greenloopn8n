import { bookingStatusToUnified, currentStepIndex, formatStamp, materialIdsInProject, materialMedia, projectNextAction, projectSteps, STEP_LABELS, type ReceiverOption, type UnifiedStatus } from "./AppExploration.helpers";
/**
 * AppExploration kit — the friendly layer over the operational engine.
 *
 * Project-first, guided, role-aware. All figures come from the domain
 * dataset via the store; no invented statistics. Advanced/technical views
 * (Allocations, ledger internals) stay available deeper in the app.
 */

import { slotLedger } from "@shared/domain/capacity";
import type {
Booking,
Project
} from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate } from "@/utils";
import { type ReactNode } from "react";
import { Link } from "react-router";

/* ------------------------------------------------------------------ */
/* Step engine — SURVEY → MATCH → RESERVE → DELIVER → VERIFY          */
/* ------------------------------------------------------------------ */

/** 0-based index of the current step (first incomplete). */

/** The seeded story project (Project A) for the default exploration view. */

/* ------------------------------------------------------------------ */
/* Role switch                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Guided workflow rail — the project's progress path                 */
/* ------------------------------------------------------------------ */

export function WorkflowRail({ projectId, compact = false, inverse = false }: { projectId: string; compact?: boolean; inverse?: boolean }) {
  const { dataset } = useGreenLoopStore();
  const steps = projectSteps(dataset, projectId);
  const current = currentStepIndex(steps);
  const done = current >= STEP_LABELS.length;

  return (
    <ol className={cn("flex flex-wrap items-center gap-x-2 gap-y-2", compact && "gap-x-1.5 gap-y-1")} aria-label="Project progress">
      {STEP_LABELS.map((label, index) => {
        const displayLabel = compact
          ? label === "Find receiver"
            ? "Match"
            : label === "Request slot"
              ? "Reserve"
              : label
          : label;
        const complete = index < current;
        const active = index === current;
        return (
          <li key={label} className={cn("flex items-center gap-2", compact && "gap-1.5")}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  compact ? "h-px w-2.5 sm:w-3" : "h-px w-4 sm:w-6",
                  complete || active ? "bg-loop-500" : "bg-gray-300 dark:bg-gray-700",
                )}
              />
            )}
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold leading-none",
                complete && "border-loop-500 bg-loop-500 text-white",
                active && (inverse ? "border-white bg-white text-ink-900" : "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900"),
                !complete && !active && (inverse ? "border-white/30 text-white/45" : "border-gray-300 text-gray-400 dark:border-gray-700"),
              )}
              aria-hidden="true"
            >
              {complete ? "✓" : index + 1}
            </span>
            <span
              className={cn(
                compact ? "text-theme-xs" : "text-theme-sm",
                complete && "text-loop-700 dark:text-loop-300",
                active && (inverse ? "font-semibold text-white" : "font-semibold text-ink-900 dark:text-white"),
                !complete && !active && (inverse ? "text-white/45" : "text-gray-400 dark:text-gray-500"),
              )}
            >
              {displayLabel}
            </span>
          </li>
        );
      })}
      {done && (
        <li className={cn("ms-1 rounded px-2 py-0.5 text-theme-xs font-medium", inverse ? "bg-loop-500/15 text-loop-300" : "bg-loop-50 text-loop-700 dark:bg-loop-500/15 dark:text-loop-300")}>
          Complete
        </li>
      )}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Next action — one obvious thing to do next                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Project card — visual, with embedded workflow rail                 */
/* ------------------------------------------------------------------ */

export function ProjectCard({ project }: { project: Project }) {
  const { dataset } = useGreenLoopStore();
  const steps = projectSteps(dataset, project.id);
  const current = currentStepIndex(steps);
  const next = projectNextAction(dataset, project.id);
  const materials = dataset.materials.filter((m) => m.projectId === project.id);
  const totalT = materials.reduce((sum, m) => sum + m.quantityT, 0);
  const verifiedT = dataset.verifications
    .filter((v) => materialIdsInProject(dataset, project.id).has(v.materialId))
    .reduce((sum, v) => sum + v.acceptedT, 0);
  const progressPct = Math.min(100, Math.round((current / STEP_LABELS.length) * 100));

  return (
    <Link
      to={`/app/projects/${project.id}`}
      className="group surface-card block p-5 transition-colors hover:border-steel-300 dark:hover:border-steel-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{project.name}</h3>
          <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">{project.location}</p>
        </div>
        <ProjectStatusChip status={project.status} />
      </div>

      <div className="mt-4">
        <WorkflowRail projectId={project.id} />
      </div>

      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={cn("h-full rounded-full transition-all", done() ? "bg-loop-500" : "bg-ink-900 dark:bg-white")}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow-label text-steel-600 dark:text-steel-400">Next action</p>
          <p className="mt-1 text-theme-sm font-semibold text-ink-900 dark:text-white">{next.label}</p>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">{next.reason}</p>
        </div>
        <p className="ledger-numeral shrink-0 text-theme-sm text-gray-500 dark:text-gray-400">
          {totalT.toFixed(1)} t surveyed{verifiedT > 0 ? ` · ${verifiedT.toFixed(1)} t verified` : ""}
        </p>
      </div>
    </Link>
  );

  function done(): boolean {
    return current >= STEP_LABELS.length;
  }

}

export function ProjectStatusChip({ status }: { status: Project["status"] }) {
  const map: Record<Project["status"], { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "border-steel-300 bg-steel-50 text-steel-700 dark:border-steel-700 dark:bg-white/5 dark:text-steel-300",
    },
    demolition: {
      label: "Demolition",
      className: "border-steel-300 bg-steel-50 text-steel-700 dark:border-steel-700 dark:bg-white/5 dark:text-steel-300",
    },
    complete: {
      label: "Complete",
      className: "border-loop-300 bg-loop-50 text-loop-700 dark:border-loop-500/30 dark:bg-loop-500/10 dark:text-loop-300",
    },
  };
  const { label, className } = map[status];
  return (
    <span className={cn("shrink-0 rounded border px-2 py-0.5 text-theme-xs font-medium", className)}>{label}</span>
  );
}

/* ------------------------------------------------------------------ */
/* Human receiver card — decisions, not algorithm dumps               */
/* ------------------------------------------------------------------ */

export function ReceiverOptionCard({
  option,
  materialT,
  onChoose,
}: {
  option: ReceiverOption;
  materialT: number;
  onChoose?: () => void;
}) {
  const fits = option.slotAvailableT >= materialT;
  return (
    <div
      className={cn(
        "surface-card p-5",
        option.recommended && "border-loop-500 dark:border-loop-500",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{option.name}</h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            {option.location} · {option.distanceKm} km away
          </p>
        </div>
        {option.recommended && (
          <span className="shrink-0 rounded bg-loop-500 px-2 py-0.5 text-theme-xs font-semibold text-white">
            Best match
          </span>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {option.reasons.map((reason) => (
          <li key={reason} className="flex items-center gap-2 text-theme-sm text-ink-800 dark:text-gray-200">
            <CheckDot ok />
            {reason}
          </li>
        ))}
        {!option.acceptsMaterial && (
          <li className="flex items-center gap-2 text-theme-sm text-error-700 dark:text-error-300">
            <CheckDot ok={false} />
            Does not accept this material type
          </li>
        )}
        {!fits && option.acceptsMaterial && (
          <li className="flex items-center gap-2 text-theme-sm text-signal-700 dark:text-signal-300">
            <CheckDot ok={false} />
            {option.slotAvailableT.toFixed(1)} t free — less than your {materialT.toFixed(1)} t (a hold would be recorded)
          </li>
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
        <p className="ledger-numeral text-theme-xs text-gray-500 dark:text-gray-400">
          {option.slotDate} · {option.slotAvailableT.toFixed(1)} of {option.slotCapacityT.toFixed(1)} t free
        </p>
        {onChoose && (
          <button
            onClick={onChoose}
            disabled={!option.acceptsMaterial}
            className={cn(
              "rounded-lg px-4 py-2 text-theme-sm font-semibold transition-colors",
              option.acceptsMaterial
                ? "bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200"
                : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800",
            )}
          >
            Choose receiver
          </button>
        )}
      </div>
    </div>
  );
}

export function CheckDot({ ok }: { ok: boolean }) {
  return ok ? (
    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-loop-500 text-xs font-bold text-white">
      ✓
    </span>
  ) : (
    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
      ✕
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Material media — evidence gallery for receivers/purchasers         */
/* ------------------------------------------------------------------ */

/** Project site-media timeline: timestamped photo/video evidence per project. */
export function ProjectSiteMedia({ projectId }: { projectId: string }) {
  const { dataset } = useGreenLoopStore();
  const materials = dataset.materials.filter((m) => m.projectId === projectId);
  const items = materials.flatMap((m) =>
    materialMedia(m).map((item) => ({ ...item, materialType: m.type })),
  );

  if (items.length === 0) {
    return <EmptyState title="No site media yet" body="Add photos or videos from the site to build evidence for receivers." action={{ label: "Open materials", to: "/app/materials" }} />;
  }

  return (
    <ul className="space-y-5">
      {items.map((item) => (
        <li key={item.id}>
          <p className="eyebrow-label text-steel-600 dark:text-steel-400">
            {formatStamp(item.recordedAt)} · {item.materialType}
          </p>
          <figure className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            {item.kind === "photo" ? (
              <img src={item.src} alt={item.caption} className="aspect-[16/9] w-full object-cover" loading="lazy" />
            ) : (
              <video src={item.src} controls preload="metadata" className="aspect-[16/9] w-full object-cover" />
            )}
            <figcaption className="border-t border-gray-200 bg-white px-3 py-2 text-theme-xs text-gray-500 dark:border-gray-800 dark:bg-gray-dark dark:text-gray-400">
              {item.caption}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Status chip — one consistent status language                        */
/* ------------------------------------------------------------------ */

export function StatusChip({ status }: { status: UnifiedStatus }) {
  const map: Record<UnifiedStatus, string> = {
    surveyed: "border-steel-300 bg-steel-50 text-steel-700 dark:border-steel-700 dark:bg-white/5 dark:text-steel-300",
    matched: "border-steel-400 bg-steel-100 text-steel-800 dark:border-steel-600 dark:bg-white/10 dark:text-steel-200",
    reserved: "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900",
    confirmed: "border-loop-500 bg-loop-50 text-loop-700 dark:border-loop-500/40 dark:bg-loop-500/10 dark:text-loop-300",
    hold: "border-signal-400 bg-signal-50 text-signal-700 dark:border-signal-500/40 dark:bg-signal-500/10 dark:text-signal-300",
    dispatched: "border-steel-400 bg-white text-ink-800 dark:border-steel-600 dark:bg-transparent dark:text-gray-200",
    verified: "border-loop-500 bg-loop-500 text-white dark:border-loop-500 dark:bg-loop-500",
    rejected: "border-error-400 bg-error-50 text-error-700 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-300",
    cancelled: "border-steel-300 bg-steel-50 text-steel-600 dark:border-steel-700 dark:bg-white/5 dark:text-steel-300",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-theme-xs font-semibold uppercase tracking-wide", map[status])}>
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — never a confusing blank screen                        */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ccd6ce] bg-gradient-to-b from-[#fbfbfa] to-[#f5f4ef] px-6 py-12 text-center shadow-xs dark:border-[#1f3727] dark:from-[#0e1913]/90 dark:to-[#08100c]/90">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-[#1e4631] shadow-xs dark:border-emerald-500/25 dark:bg-emerald-950/50 dark:text-[#00e599]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V9l8-5 8 5v10" />
          <path d="M9 19v-6h6v6m-7-5 2 2 4-4" />
        </svg>
      </span>
      <h3 className="mt-4 font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-steel-600 dark:text-steel-400">{body}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1c3c2b] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#254f38] hover:shadow-md hover:ring-2 hover:ring-emerald-500/30 dark:bg-[#224833] dark:hover:bg-[#2b5a40]"
        >
          {action.label} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome greeting — time-of-day, no invented figures                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Primary action tiles — the "What would you like to do?" row         */
/* ------------------------------------------------------------------ */

export function PrimaryActions() {
  const { dataset } = useGreenLoopStore();
  const todaysBookings = dataset.bookings.filter(
    (b) => b.status === "confirmed" || b.status === "hold",
  ).length;

  const tiles: { label: string; hint: string; to: string; emphasis?: boolean }[] = [
    { label: "Start a new project", hint: "Survey materials and build passports", to: "/app/projects", emphasis: true },
    { label: "Continue a project", hint: "Pick up where you left off", to: "/app/projects" },
    { label: "View today's bookings", hint: `${todaysBookings} active booking${todaysBookings === 1 ? "" : "s"}`, to: "/app/bookings" },
  ];

  return (
    <div className="grid gap-detail sm:grid-cols-3">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          to={tile.to}
          className={cn(
            "group rounded-sm border p-4 transition-colors",
            tile.emphasis
              ? "border-ink-900 bg-ink-900 text-white hover:bg-ink-800 dark:border-white dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200"
              : "border-steel-200 bg-gray-25 hover:border-steel-400 dark:border-steel-800 dark:bg-gray-dark dark:hover:border-steel-600",
          )}
        >
          <p className="font-archivo text-theme-base font-bold">{tile.label}</p>
          <p className={cn("mt-1 text-theme-xs", tile.emphasis ? "text-white/70 dark:text-ink-700" : "text-gray-500 dark:text-gray-400")}>
            {tile.hint}
          </p>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Slot availability strip — receiver capacity at a glance             */
/* ------------------------------------------------------------------ */

export function SlotAvailability({ slotId }: { slotId: string }) {
  const { dataset } = useGreenLoopStore();
  const ledger = slotLedger(dataset, slotId);
  if (!ledger) return null;
  if (ledger.available === 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow-label text-steel-600 dark:text-steel-400">{formatDate(ledger.slot.date)} · {ledger.slot.materialType}</p>
          <p className="text-theme-sm font-bold uppercase tracking-wider text-signal-600 dark:text-signal-400">
            Full
          </p>
        </div>
      </div>
    );
  }

  const capacityT = ledger.slot.capacityT;
  const pct = Math.round((ledger.available / capacityT) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow-label text-steel-600 dark:text-steel-400">{formatDate(ledger.slot.date)} · {ledger.slot.materialType}</p>
        <p className="ledger-numeral text-theme-sm font-semibold text-ink-900 dark:text-white">
          {ledger.available.toFixed(1)} / {capacityT.toFixed(1)} t free
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" role="img" aria-label={`${pct}% of slot capacity available`}>
        <div className="h-full rounded-full bg-loop-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Booking summary row — human language, not ledger internals          */
/* ------------------------------------------------------------------ */

export function BookingSummaryRow({ booking }: { booking: Booking }) {
  const { dataset } = useGreenLoopStore();
  const receiver = dataset.receivers.find((r) => r.id === booking.receiverId);
  const material = dataset.materials.find((m) => m.id === booking.materialId);
  const slot = dataset.slots.find((s) => s.id === booking.slotId);
  const status = bookingStatusToUnified(booking.status);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
      <div className="min-w-40">
        <p className="text-theme-sm font-semibold text-ink-900 dark:text-white">
          {booking.tonnesT.toFixed(1)} t {material?.type ?? "material"}
        </p>
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
          {receiver?.name ?? booking.receiverId} · {slot?.date ?? booking.slotId}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {booking.status === "hold" && booking.holdReason && (
          <span className="hidden max-w-56 truncate text-theme-xs text-signal-700 sm:block dark:text-signal-300">
            {booking.holdReason}
          </span>
        )}
        <StatusChip status={status} />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Page header — friendly title + optional back link                  */
/* ------------------------------------------------------------------ */

export function FriendlyPageHeader({ title, subtitle, children, className, titleClassName }: { title: string; subtitle?: string; children?: ReactNode; className?: string; titleClassName?: string }) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-3 ${className ?? ""}`}>
      <div>
        <h1 className={`font-archivo text-2xl font-bold text-ink-900 dark:text-white ${titleClassName ?? ""}`}>{title}</h1>
        {subtitle && <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
