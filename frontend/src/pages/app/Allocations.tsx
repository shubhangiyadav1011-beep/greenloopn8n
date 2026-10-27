import PageMeta from "@/components/common/PageMeta";
import { EmptyState } from "@/components/greenloop/AppExploration";
import MatchDetailsPanel from "@/components/greenloop/MatchDetailsPanel";
import StatusBadge from "@/components/greenloop/StatusBadge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ambientMedia, materialMediaFor, receiverMediaFor } from "@/config/appMedia";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatINRPerT } from "@/utils";
import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

export default function Allocations() {
  const { dataset } = useGreenLoopStore();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const materialMedia = (id: string) => materialMediaFor(dataset.materials.find((material) => material.id === id)?.type ?? "");

  const materialLabel = (id: string) => {
    const material = dataset.materials.find((item) => item.id === id);
    return material ? `${material.type} (${id})` : id;
  };
  const receiverName = (id: string) => dataset.receivers.find((receiver) => receiver.id === id)?.name ?? id;
  const requestedDate = (slotId: string) => dataset.slots.find((slot) => slot.id === slotId)?.date;

  return (
    <div className="relative min-h-screen pb-16">
      <PageMeta
        title="Matches | GreenLoop"
        description="See which receivers match each material and why a destination is suitable."
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
          <p className="eyebrow-label text-loop-300">Provider operations</p>
          <h1 className="mt-1 font-archivo font-bold tracking-tight gl-page-title">Material matches</h1>
        </div>
      </motion.header>

      <div className="space-y-4">
        {dataset.allocations.map((allocation, index) => {
          const media = materialMedia(allocation.materialId);
          const material = dataset.materials.find((m) => m.id === allocation.materialId);
          const activeCandidate = allocation.candidates.find((c) => c.receiverId === selectedCandidateId) || allocation.candidates[0];

          return (
            <motion.section
              key={allocation.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.3 }}
              className="overflow-hidden border border-[#e5e1d8] bg-white shadow-sm dark:border-steel-800 dark:bg-[#17251d] rounded-surface"
            >
              <div className="flex flex-wrap items-center gap-3 bg-[#f8f7f2] p-3 sm:p-4 dark:bg-white/[0.03]">
                <Link to={`/app/materials/${allocation.materialId}`} className="group relative size-[68px] shrink-0 overflow-hidden rounded-xl border border-steel-200 dark:border-steel-700" aria-label={`View passport ${allocation.materialId}`}>
                  <img src={media.src} alt={media.alt} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="ledger-numeral text-xs font-semibold text-steel-600 dark:text-steel-400">{allocation.id}</span>
                    <span className="text-steel-300 dark:text-steel-600" aria-hidden="true">·</span>
                    <Link to={`/app/materials/${allocation.materialId}`} className="truncate font-archivo text-sm font-bold capitalize text-ink-900 hover:text-loop-700 dark:text-white dark:hover:text-loop-400">
                      {materialLabel(allocation.materialId)}
                    </Link>
                    <span className="text-steel-400" aria-hidden="true">→</span>
                    <Link to="/app/market-demand?view=receivers" className="truncate text-sm font-semibold text-ink-900 hover:text-loop-700 dark:text-white dark:hover:text-loop-400">
                      {receiverName(allocation.receiverId)}
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-steel-600 dark:text-gray-400">
                    <span className="ledger-numeral font-bold text-ink-900 dark:text-gray-200">{allocation.requestedT.toFixed(1)} t</span> requested
                    <span className="text-steel-300" aria-hidden="true">·</span>
                    <span>{requestedDate(allocation.slotId) ? <time dateTime={requestedDate(allocation.slotId)}>{requestedDate(allocation.slotId)}</time> : "Date not set"}</span>
                    {material?.condition && (
                      <>
                        <span className="text-steel-300" aria-hidden="true">·</span>
                        <span className="capitalize">{material.condition} condition (Grade {material.grade})</span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={allocation.status} size="md" />
              </div>

              <details className="group border-t border-steel-200 dark:border-steel-800" open>
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold text-ink-800 marker:hidden hover:text-loop-700 focus-visible:outline-2 focus-visible:outline-loop-600 dark:text-gray-200 dark:hover:text-loop-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Match Breakdown &amp; Explanations</span>
                    <span className="rounded-full bg-[#eef3ee] px-2 py-0.5 text-[10px] text-[#2d5f3a] dark:bg-[#203c2a] dark:text-[#a0cfae]">
                      {allocation.candidates.length} receiver{allocation.candidates.length === 1 ? "" : "s"} evaluated
                    </span>
                  </span>
                  <svg viewBox="0 0 20 20" className="size-4 transition-transform duration-200 group-open:rotate-180 text-steel-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </summary>
                <div className="border-t border-steel-200 dark:border-steel-800">
                  {allocation.holdReason && (
                    <div className="border-b border-signal-200 bg-signal-50 px-4 py-3 dark:border-signal-500/30 dark:bg-signal-500/10">
                      <p className="text-xs leading-relaxed text-signal-900 dark:text-signal-100">
                        <strong className="uppercase tracking-wide">Capacity Hold:</strong> {allocation.holdReason}
                      </p>
                    </div>
                  )}

                  {/* Candidate scoring table */}
                  <div className="max-w-full overflow-x-auto">
                    <Table>
                      <TableHeader className="border-b border-steel-200 bg-gray-50/60 dark:border-steel-800 dark:bg-white/[0.01]">
                        <TableRow className="hover:bg-transparent">
                          <TableCell isHeader className="px-4 py-3 text-start font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Receiver</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Suitability</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Demand</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Distance</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Slot Capacity</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Transport</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400 whitespace-nowrap text-[11px]">Handling</TableCell>
                          <TableCell isHeader className="px-4 py-3 text-end font-bold uppercase tracking-wider text-loop-600 dark:text-loop-500 whitespace-nowrap text-[11px]">Score</TableCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-steel-100 dark:divide-steel-800">
                        {allocation.candidates.map((candidate) => {
                          const isSelected = (selectedCandidateId ?? allocation.receiverId) === candidate.receiverId;
                          return (
                            <TableRow
                              key={candidate.receiverId}
                              onClick={() => setSelectedCandidateId(candidate.receiverId)}
                              className={cn(
                                "cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]",
                                isSelected ? "bg-[#f2f7f3] dark:bg-[#1a3826]/30 font-semibold" : candidate.recommended ? "bg-loop-50/30 dark:bg-loop-500/5" : ""
                              )}
                            >
                              <TableCell className="px-4 py-3 text-start">
                                <span className="flex items-center gap-3">
                                  <img
                                    src={receiverMediaFor(candidate.receiverId).src}
                                    alt={receiverMediaFor(candidate.receiverId).alt}
                                    loading="lazy"
                                    className="hidden h-9 w-12 shrink-0 rounded border border-steel-200 bg-steel-100 object-cover sm:block dark:border-steel-800 dark:bg-steel-900"
                                  />
                                  <span className="font-archivo text-sm font-semibold text-ink-900 dark:text-white">
                                    {receiverName(candidate.receiverId)}
                                  </span>
                                </span>
                                {candidate.recommended && (
                                  <span className="mt-1 inline-flex items-center rounded-full bg-loop-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-loop-700 dark:bg-loop-500/20 dark:text-loop-400">
                                    ★ Recommended
                                  </span>
                                )}
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {Math.round(candidate.suitability * 100)}%
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {Math.round(candidate.demand * 100)}%
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {candidate.distanceKm} km
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {candidate.availableT.toFixed(1)} t
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {formatINRPerT(candidate.transportCostPerT)}
                              </TableCell>
                              <TableCell mono className="px-4 py-3 text-end text-xs font-medium text-steel-700 dark:text-gray-300">
                                {formatINRPerT(candidate.handlingCostPerT)}
                              </TableCell>
                              <TableCell mono className={cn("px-4 py-3 text-end text-sm font-bold", candidate.recommended ? "text-loop-600 dark:text-loop-400" : "text-ink-900 dark:text-gray-200")}>
                                {candidate.score.toFixed(3)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Detailed Analysis Panel for Selected Candidate */}
                  {activeCandidate && (
                    <div className="border-t border-steel-200 p-4 dark:border-steel-800">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-steel-600 dark:text-gray-400">
                          Detailed Factor Analysis: {receiverName(activeCandidate.receiverId)}
                        </span>
                        <span className="text-xs text-steel-500">
                          Click any receiver in the table to inspect
                        </span>
                      </div>
                      <MatchDetailsPanel match={activeCandidate} />
                    </div>
                  )}

                  <div className="border-t border-steel-200 bg-[#f8f7f2] px-4 py-3 dark:border-steel-800 dark:bg-white/[0.02]">
                    <p className="text-xs leading-relaxed text-steel-600 dark:text-steel-400">
                      Deterministic match criteria: compatibility &amp; suitability (40%) · facility demand (25%) · receiving slot availability (20%) · proximity (15%). Transport and handling costs are indicative logistics rates based on transit distance. Full comparative cost savings analysis belongs to Phase 6.
                    </p>
                    <p className="mt-1 break-words text-[11px] text-steel-500 dark:text-steel-400">
                      Match ID: {allocation.id} · Receiving slot: {allocation.slotId} · Capacity: {allocation.capacityBeforeT.toFixed(1)} t → {allocation.capacityAfterT.toFixed(1)} t remaining
                    </p>
                  </div>
                </div>
              </details>
            </motion.section>
          );
        })}

        {dataset.allocations.length === 0 && (
          <EmptyState
            title="No matches yet"
            body="Find a receiver for your material to create a match and view capability evaluations."
            action={{ label: "Find receivers", to: "/app/market-demand?view=receivers" }}
          />
        )}
      </div>
    </div>
  );
}
