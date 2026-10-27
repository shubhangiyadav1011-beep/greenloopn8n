/**
 * Event-log helpers over GreenLoopDataset.events. Appending is owned by the
 * capacity engine; these utilities cover reading and presentation order.
 */

import type { DomainEvent, GreenLoopDataset } from "@shared/domain/types.ts";

/** Newest first — the default for activity feeds. */
export function eventsNewestFirst(dataset: GreenLoopDataset): DomainEvent[] {
  return [...dataset.events].sort((a, b) => b.at.localeCompare(a.at));
}

/** Oldest first — the default for timelines and the site ledger replay. */
export function eventsOldestFirst(dataset: GreenLoopDataset): DomainEvent[] {
  return [...dataset.events].sort((a, b) => a.at.localeCompare(b.at));
}

export function eventsForSubjects(dataset: GreenLoopDataset, subjectIds: string[]): DomainEvent[] {
  const set = new Set(subjectIds);
  return eventsOldestFirst(dataset).filter((e) => e.subjectIds.some((id) => set.has(id)));
}

/** Compact "09:05 · Harrow Road Demolition — 10.0 t requested at Riverstone" trail lines. */
export function eventTrail(dataset: GreenLoopDataset, limit?: number): string[] {
  const events = eventsNewestFirst(dataset);
  const lines = events.map((e) => {
    const time = e.at.slice(11, 16);
    const day = e.at.slice(5, 10);
    return `${day} ${time} · ${e.summary}`;
  });
  return limit ? lines.slice(0, limit) : lines;
}
