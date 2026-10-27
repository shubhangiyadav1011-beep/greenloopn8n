import { EASE, JOURNEY_STAGES, KIT_STATUS_CLASS, WORKFLOW_STEPS, type EvidenceItem, type KitStatus } from "./kit.helpers";
/**
 * GreenLoop authenticated-app kit — the shared visual system.
 *
 * One import site (`@/components/greenloop/kit`) for the components every
 * page composes from: headers, media panels, capacity meters, status chips,
 * workflow rails, tabs, galleries and motion primitives. Animation here is
 * meaningful and calm; reduced motion renders final states directly.
 */

import type { AppMedia, AppVideo } from "@/config/appMedia";
import { cn } from "@/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Motion primitives                                                   */
/* ------------------------------------------------------------------ */

/** Consistent page-enter: children stagger in once on mount. */
export function PageMotion({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Direct child of PageMotion (or standalone reveal) — rises 18px into view. */
export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Count-up numeral used for operational figures; resolves to the real value. */
export function Counter({
  value,
  decimals = 1,
  suffix = "",
  className,
  duration = 1.1,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      setDisplay(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, reduce]);

  return (
    <span className={cn("ledger-numeral tabular-nums", className)}>
      {(reduce ? value : display).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  context,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  context?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow-label text-steel-500 dark:text-steel-400">{eyebrow}</p>}
        <h1 className="mt-2 font-archivo font-bold tracking-tight text-ink-900 dark:text-white gl-page-title">
          {title}
        </h1>
        {context && <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">{context}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Media panels — image + video with one coherent grade                */
/* ------------------------------------------------------------------ */

/** Image panel with optional scrim tone, caption chip and slow zoom on view. */
export function MediaPanel({
  media,
  className,
  aspect = "aspect-[16/9]",
  scrim = "bg-ink-950/35",
  caption,
  children,
  zoom = true,
}: {
  media: AppMedia;
  className?: string;
  aspect?: string;
  scrim?: string;
  caption?: string;
  children?: ReactNode;
  zoom?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <figure className={cn("relative overflow-hidden border border-steel-200 dark:border-steel-800", aspect, className)}>
      <img
        src={media.src}
        alt={media.alt}
        loading="lazy"
        className={cn("absolute inset-0 size-full object-cover", !reduce && zoom && "motion-safe:transition-transform motion-safe:duration-[1200ms] group-hover:scale-[1.04]")}
      />
      {scrim && <div className={cn("pointer-events-none absolute inset-0", scrim)} aria-hidden="true" />}
      {caption && (
        <figcaption className="absolute bottom-3 left-3 border border-white/20 bg-ink-950/70 px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm rounded-surface">
          {caption}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

/**
 * Muted, looping, visibility-gated video panel — app-grade video usage:
 * subtle, atmospheric, never behind dense text. Reduced motion = poster.
 */
export function VideoPanel({
  video,
  className,
  aspect = "aspect-[16/9]",
  scrim = "bg-ink-950/45",
  caption,
  children,
}: {
  video: AppVideo;
  className?: string;
  aspect?: string;
  scrim?: string;
  caption?: string;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const media = videoRef.current;
    if (!frame || !media || reduce) return;
    let visible = false;
    const tryPlay = () => {
      if (visible && media.paused) media.play().catch(() => {});
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) tryPlay();
        else media.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(frame);
    const keepalive = window.setInterval(tryPlay, 4000);
    return () => {
      observer.disconnect();
      window.clearInterval(keepalive);
    };
  }, [reduce]);

  return (
    <figure ref={frameRef} className={cn("relative overflow-hidden border border-steel-200 bg-ink-950 dark:border-steel-800", aspect, className)}>
      {reduce ? (
        <img src={video.poster} alt={video.alt} className="absolute inset-0 size-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}
          src={video.src}
          poster={video.poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          onCanPlay={() => setReady(true)}
        />
      )}
      {scrim && <div className={cn("pointer-events-none absolute inset-0", scrim)} aria-hidden="true" />}
      {caption && (
        <figcaption className="absolute bottom-3 left-3 border border-white/20 bg-ink-950/70 px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm rounded-surface">
          {caption}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Status language — one chip system across the app                    */
/* ------------------------------------------------------------------ */

export function StatusChip({ status, label, className }: { status: KitStatus; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-theme-xs font-semibold uppercase tracking-wide transition-colors duration-300",
        KIT_STATUS_CLASS[status],
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Capacity meter — the shared ledger visual                           */
/* ------------------------------------------------------------------ */

export function CapacityMeter({
  total,
  reserved = 0,
  held = 0,
  showLegend = true,
  height = "h-3",
  animate = true,
  className,
}: {
  total: number;
  reserved?: number;
  held?: number;
  showLegend?: boolean;
  height?: string;
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const safeTotal = Math.max(total, 0.0001);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / safeTotal) * 100))}%`;
  const available = Math.max(0, total - reserved - held);
  const segments = [
    { key: "reserved", value: reserved, cls: "bg-loop-600 dark:bg-loop-400" },
    { key: "held", value: held, cls: "bg-signal-500/80" },
    { key: "available", value: available, cls: "bg-steel-200 dark:bg-white/15" },
  ] as const;

  return (
    <div className={className}>
      <div className={cn("flex w-full overflow-hidden rounded-sm bg-white/60 dark:bg-white/10", height)} role="img" aria-label={`Capacity: ${reserved} reserved, ${held} held, ${available} available of ${total} tonnes`}>
        {segments.map((s) =>
          s.value <= 0 ? null : (
            <motion.div
              key={s.key}
              className={cn("h-full", s.cls)}
              initial={animate && !reduce ? { width: 0 } : false}
              animate={{ width: pct(s.value) }}
              transition={{ duration: 0.7, ease: EASE }}
              style={animate && reduce ? { width: pct(s.value) } : undefined}
            />
          ),
        )}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-theme-xs text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-loop-600 dark:bg-loop-400" aria-hidden="true" />Reserved <span className="ledger-numeral font-semibold text-ink-900 dark:text-white">{reserved.toFixed(1)} t</span></span>
          {held > 0 && (
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-signal-500/80" aria-hidden="true" />Held <span className="ledger-numeral font-semibold text-ink-900 dark:text-white">{held.toFixed(1)} t</span></span>
          )}
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-steel-200 dark:bg-white/20" aria-hidden="true" />Available <span className="ledger-numeral font-semibold text-ink-900 dark:text-white">{available.toFixed(1)} t</span></span>
          <span className="ms-auto ledger-numeral text-gray-500 dark:text-gray-500">{total.toFixed(1)} t total</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow — 7-step rail and big progress variant                     */
/* ------------------------------------------------------------------ */

export function WorkflowRail7({
  current,
  inverse = false,
  className,
}: {
  /** 0-based index of the active step; steps.length = all complete. */
  current: number;
  inverse?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2", className)} aria-label="Recovery workflow">
      {WORKFLOW_STEPS.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true" className={cn("h-px w-3", complete || active ? (inverse ? "bg-loop-300" : "bg-loop-500") : inverse ? "bg-white/25" : "bg-gray-300 dark:bg-gray-700")} />}
            <motion.span
              aria-hidden="true"
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-xs font-semibold leading-none",
                complete && "border-loop-500 bg-loop-500 text-white",
                active && !complete && (inverse ? "border-white bg-white text-ink-900" : "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900"),
                !complete && !active && (inverse ? "border-white/30 text-white/45" : "border-gray-300 text-gray-400 dark:border-gray-700"),
              )}
              initial={reduce ? false : { scale: 0.85, opacity: 0.6 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.07, duration: 0.35, ease: EASE }}
            >
              {complete ? "✓" : index + 1}
            </motion.span>
            <span
              className={cn(
                "text-theme-xs",
                complete && (inverse ? "text-loop-200" : "text-loop-700 dark:text-loop-300"),
                active && !complete && (inverse ? "font-semibold text-white" : "font-semibold text-ink-900 dark:text-white"),
                !complete && !active && (inverse ? "text-white/45" : "text-gray-400 dark:text-gray-500"),
              )}
            >
              {step}
            </span>
          </li>
        );
      })}
      {current >= WORKFLOW_STEPS.length && (
        <li className={cn("ms-1 rounded px-2 py-0.5 text-theme-xs font-medium", inverse ? "bg-loop-500/15 text-loop-300" : "bg-loop-50 text-loop-700 dark:bg-loop-500/15 dark:text-loop-300")}>
          Complete
        </li>
      )}
    </ol>
  );
}

/** Big command-view progress: current step highlighted with reason line. */
export function WorkflowProgress({ current, reason }: { current: number; reason?: string }) {
  const reduce = useReducedMotion();
  const pct = Math.min(100, (current / WORKFLOW_STEPS.length) * 100);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <WorkflowRail7 current={current} />
        <span className="ledger-numeral shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{Math.round(pct)}%</span>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10" aria-hidden="true">
        <motion.div
          className={cn("h-full rounded-full", current >= WORKFLOW_STEPS.length ? "bg-loop-500" : "bg-ink-900 dark:bg-white")}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
      {reason && <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">{reason}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  suffix = "",
  decimals = 1,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  hint?: string;
  tone?: "default" | "positive" | "attention";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-surface border bg-white gl-card-pad dark:bg-white/[0.02]",
        tone === "positive" && "border-loop-300 dark:border-loop-500/30",
        tone === "attention" && "border-signal-300 dark:border-signal-500/30",
        tone === "default" && "border-steel-200 dark:border-steel-800",
        className,
      )}
    >
      <p className="eyebrow-label text-steel-500 dark:text-steel-400">{label}</p>
      <p className="mt-2">
        <Counter value={value} decimals={decimals} suffix={suffix} className="text-2xl font-bold text-ink-900 dark:text-white" />
      </p>
      {hint && <p className="mt-auto pt-detail text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence gallery — figure grid with lightbox-lite                   */
/* ------------------------------------------------------------------ */

export function EvidenceGallery({ items, className }: { items: EvidenceItem[]; className?: string }) {
  const [open, setOpen] = useState<EvidenceItem | null>(null);
  const reduce = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <ul className="grid grid-cols-2 gap-detail sm:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="group relative block w-full overflow-hidden border border-steel-200 bg-steel-50 text-start dark:border-steel-800 dark:bg-white/5 rounded-surface"
              aria-label={`View evidence: ${item.label}`}
            >
              {item.src ? (
                <img src={item.src} alt={item.label} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : (
                <span className="flex aspect-[4/3] w-full items-center justify-center text-theme-xs text-steel-500 dark:text-steel-400">{item.kind ?? "Document"}</span>
              )}
              <span className="block border-t border-steel-200 px-2 py-1.5 text-theme-xs font-medium text-ink-800 dark:border-steel-800 dark:text-gray-300">{item.label}</span>
            </button>
            {index === 0 && null}
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-999999 flex items-center justify-center bg-ink-950/85 p-6"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
            role="dialog"
            aria-modal="true"
            aria-label={open.label}
          >
            <motion.figure
              className="max-h-full max-w-3xl"
              initial={reduce ? false : { scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              {open.src && <img src={open.src} alt={open.label} className="max-h-[75vh] w-full border border-white/20 object-contain" />}
              <figcaption className="mt-3 flex items-center justify-between gap-4 text-sm text-white/85">
                <span>{open.label}</span>
                {open.recordedAt && <span className="ledger-numeral text-xs text-white/60">{open.recordedAt}</span>}
                <button type="button" onClick={() => setOpen(null)} className="border border-white/30 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10">
                  Close
                </button>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ccd6ce] bg-gradient-to-b from-[#fbfbfa] to-[#f5f4ef] px-6 py-12 text-center shadow-xs dark:border-[#1f3727] dark:from-[#0e1913]/90 dark:to-[#08100c]/90", className)}>
      <span className="flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-[#1e4631] shadow-xs dark:border-emerald-500/25 dark:bg-emerald-950/50 dark:text-[#00e599]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4.3 7.6 7.7 4.3 7.7-4.3M12 12v9" />
        </svg>
      </span>
      <h3 className="mt-4 font-archivo text-xl font-bold tracking-tight text-ink-900 dark:text-white">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-steel-600 dark:text-steel-400">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export function TabBar({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-steel-200 dark:border-steel-800", className)} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative shrink-0 px-4 py-2.5 text-theme-sm font-medium transition-colors",
              isActive ? "text-ink-900 dark:text-white" : "text-gray-500 hover:text-ink-800 dark:text-gray-400 dark:hover:text-gray-200",
            )}
          >
            {tab.label}
            {isActive && (
              <motion.span
                className="absolute inset-x-2 -bottom-px h-0.5 bg-loop-500"
                layoutId={reduce ? undefined : "kit-tab-underline"}
                transition={{ duration: 0.25, ease: EASE }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm modal                                                       */
/* ------------------------------------------------------------------ */

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-999999 flex items-center justify-center bg-ink-950/70 p-4"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className="w-full max-w-md border border-steel-200 bg-white shadow-xl dark:border-steel-800 dark:bg-gray-dark gl-card-pad rounded-surface"
            initial={reduce ? false : { scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{title}</h3>
            {body && <p className="mt-2 text-theme-sm leading-6 text-gray-600 dark:text-gray-400">{body}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="min-h-11 border border-steel-300 px-4 text-theme-sm font-semibold text-ink-800 hover:bg-gray-50 dark:border-steel-700 dark:text-gray-200 dark:hover:bg-white/5">
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  "min-h-11 px-4 text-theme-sm font-bold transition-colors",
                  tone === "danger" ? "bg-error-500 text-white hover:bg-error-600" : "bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200",
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Journey strip — BOOKED → DISPATCHED → IN TRANSIT → RECEIVED → VERIFIED */
/* ------------------------------------------------------------------ */

export function JourneyStrip({ current, className }: { current: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <ol className={cn("flex items-center", className)} aria-label="Delivery progress">
      {JOURNEY_STAGES.map((stage, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-3.5 items-center justify-center rounded-full border-2",
                  complete && "border-loop-500 bg-loop-500",
                  active && !complete && "border-ink-900 bg-white dark:border-white dark:bg-gray-dark",
                  !complete && !active && "border-gray-300 bg-white dark:border-gray-700 dark:bg-transparent",
                )}
              >
                {complete && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span className={cn("whitespace-nowrap text-xs font-semibold uppercase tracking-wide", complete || active ? "text-ink-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
                {stage}
              </span>
            </div>
            {index < JOURNEY_STAGES.length - 1 && (
              <span className="relative mx-1.5 mb-4 h-px flex-1 bg-gray-200 dark:bg-gray-700" aria-hidden="true">
                {complete && (
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-loop-500"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.5, ease: EASE }}
                  />
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
