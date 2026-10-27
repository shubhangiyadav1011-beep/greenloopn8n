import { useAuth } from "@/context/AuthContext.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn } from "@/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

/**
 * Global operational search — projects, materials, receivers and bookings
 * by id or name. ⌘K/Ctrl+K opens the palette (header also focuses its
 * inline field); results navigate to the operational page.
 */
export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { group: string; label: string; hint: string; to: string; state?: Record<string, string> }[] = [];
    for (const p of dataset.projects) {
      if (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) {
        out.push({ group: "Projects", label: p.name, hint: p.id, to: `/app/projects/${p.id}` });
      }
    }
    for (const m of dataset.materials) {
      if (m.id.toLowerCase().includes(q) || m.type.includes(q)) {
        out.push({ group: "Materials", label: `${m.type} · ${m.quantityT.toFixed(1)} t`, hint: m.id, to: `/app/materials/${m.id}` });
      }
    }
    for (const r of dataset.receivers) {
      if (r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) {
        out.push({ group: "Receivers", label: r.name, hint: `${r.distanceKm} km · ${r.location}`, to: "/app/market-demand?view=receivers" });
      }
    }
    const dispatchedKinds = new Set(dataset.events.filter((e) => e.kind === "load.dispatched").flatMap((e) => e.subjectIds));
    const verifiedBookingIds = new Set(dataset.verifications.map((v) => v.bookingId));
    const isReceiver = user?.activeWorkspace === "receiver";
    for (const b of dataset.bookings) {
      if (b.id.toLowerCase().includes(q) || (b.loadRef ?? "").toLowerCase().includes(q)) {
        const detail = isReceiver && dispatchedKinds.has(b.id) && !verifiedBookingIds.has(b.id)
          ? "/app/receiver/verification"
          : "/app/deliveries";
        out.push({ group: "Bookings", label: `${b.id} · ${b.tonnesT.toFixed(1)} t`, hint: b.status, to: detail });
      }
    }
    for (const v of dataset.verifications) {
      if (v.loadRef.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)) {
        out.push({ group: "Proof of Recovery", label: `${v.loadRef} · ${v.acceptedT.toFixed(1)} t accepted`, hint: v.status, to: "/app/verification" });
      }
    }
    return out.slice(0, 9);
  }, [dataset, query, user?.activeWorkspace]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-999999 flex items-start justify-center bg-ink-950/60 px-4 pt-[12vh]"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Search GreenLoop"
        >
          <motion.div
            className="w-full max-w-xl border border-steel-200 bg-white shadow-2xl dark:border-steel-800 dark:bg-gray-dark"
            initial={reduce ? false : { scale: 0.96, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-steel-200 dark:border-steel-800">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "Enter" && results[0]) {
                    navigate(results[0].to, { state: results[0].state });
                    onClose();
                  }
                }}
                placeholder="Search projects, materials, receivers, bookings…"
                className="h-14 w-full bg-transparent px-5 text-base text-ink-900 placeholder:text-gray-400 focus:outline-none dark:text-white dark:placeholder:text-white/30"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">
                  {query ? "No matches in this workspace data." : "Type to search — try “Harrow”, “MP-101”, or a booking id."}
                </li>
              )}
              {results.map((r, i) => (
                <li key={`${r.group}-${r.hint}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(r.to, { state: r.state });
                      onClose();
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors hover:bg-gray-50 dark:hover:bg-white/5",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-theme-sm font-medium text-ink-900 dark:text-white">{r.label}</span>
                      <span className="ledger-numeral block text-theme-xs text-gray-500 dark:text-gray-400">{r.hint}</span>
                    </span>
                    <span className="eyebrow-label shrink-0 text-steel-500 dark:text-steel-400">{r.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
