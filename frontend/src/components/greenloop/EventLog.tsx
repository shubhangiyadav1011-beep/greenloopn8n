import { eventsNewestFirst } from "@/domain/events";
import type { DomainEvent } from "@shared/domain/types";
import { cn } from "@/utils";

const KIND_TONE: Record<string, string> = {
  confirmed: "bg-loop-500",
  recheck: "bg-loop-500",
  hold: "bg-signal-500",
  released: "bg-error-400",
  cancelled: "bg-error-400",
  rejected: "bg-error-500",
  dispatched: "bg-ink-900 dark:bg-white/85",
};

function toneFor(kind: string): string {
  return (
    Object.entries(KIND_TONE).find(([key]) => kind.includes(key))?.[1] ??
    "bg-steel-400"
  );
}

/**
 * Read-only view of the domain event log (already ordered newest-first by
 * eventsNewestFirst). Every transition in the scenario lands here.
 */
export default function EventLog({
  events,
  limit,
  className,
}: {
  events: DomainEvent[];
  limit?: number;
  className?: string;
}) {
  const ordered = eventsNewestFirst({ events } as never);
  const shown = limit ? ordered.slice(0, limit) : ordered;

  return (
    <ol className={cn("space-y-4", className)}>
      {shown.map((event) => (
        <li key={event.id} className="flex items-start gap-3">
          <span
            className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneFor(event.kind))}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-theme-sm font-medium text-ink-900 dark:text-white/90">
              {event.summary}
            </p>
            {event.detail && (
              <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{event.detail}</p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
              <span className="ledger-numeral">
                {event.at.slice(0, 10)} {event.at.slice(11, 16)}
              </span>
              <span className="h-1 w-1 rounded-full bg-gray-300" aria-hidden="true" />
              <span>{event.actor.name}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" aria-hidden="true" />
              <span className="font-mono text-steel-600 dark:text-steel-400">{event.kind}</span>
            </p>
          </div>
        </li>
      ))}
      {shown.length === 0 && (
        <li className="text-theme-sm text-gray-500 dark:text-gray-400">No events yet.</li>
      )}
    </ol>
  );
}
