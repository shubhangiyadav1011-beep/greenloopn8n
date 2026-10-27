import PageMeta from "@/components/common/PageMeta";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatStamp } from "@/utils";
import { motion } from "motion/react";

export default function AuditTrail() {
  const { dataset } = useGreenLoopStore();
  const events = [...dataset.events].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="relative min-h-screen pb-24">
      <PageMeta title="Activity history | GreenLoop" description="Review the GreenLoop shared transaction event history." />

      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-section border-b border-steel-200 pb-6 dark:border-steel-800"
      >
        <p className="eyebrow-label text-loop-600 dark:text-loop-400">Shared ledger</p>
        <h1 className="mt-3 font-archivo font-bold tracking-tight text-ink-900 dark:text-white gl-page-title">Activity history</h1>
      </motion.header>

      {events.length === 0 ? (
        <div className="border border-dashed border-steel-300 bg-white p-10 text-center dark:border-steel-700 dark:bg-white/[0.02] rounded-surface">
          <p className="font-archivo text-lg font-bold text-ink-900 dark:text-white">No activity yet</p>
          <p className="mt-2 text-sm text-steel-500 dark:text-gray-400">Bookings, dispatches and verifications will appear here as they happen.</p>
        </div>
      ) : (
        <ol className="border-s border-steel-200 dark:border-steel-800" aria-label="Event history">
          {events.map((event, i) => (
            <motion.li
              key={event.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.35, ease: "easeOut" }}
              className="relative py-5 pe-2 ps-6"
            >
              <span className="absolute top-7 -start-1.5 size-3 rounded-full border-2 border-white bg-loop-500 dark:border-gray-900" aria-hidden="true" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink-900 dark:text-white">{event.summary}</p>
                <time className="ledger-numeral text-xs font-bold text-steel-500 dark:text-gray-400" dateTime={event.at}>{formatStamp(event.at)}</time>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-steel-600 dark:text-gray-400">
                <span>{event.actor.name}</span>
                <span aria-hidden="true">·</span>
                <code className="rounded-sm bg-steel-100 px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider text-steel-600 dark:bg-white/5 dark:text-gray-400">{event.kind}</code>
              </p>
              {event.detail && <p className="mt-1 text-sm text-steel-500 dark:text-gray-500">{event.detail}</p>}
              <p className="ledger-numeral mt-1 text-xs text-steel-400 dark:text-steel-500">{event.subjectIds.join(" · ")}</p>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}
