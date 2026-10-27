import { useState } from "react";
import type { LandedCostCalculation } from "@shared/domain/landedCost";
import { formatINR, formatINRPerT } from "@/utils";

interface LandedCostCardProps {
  calculation: LandedCostCalculation;
  compact?: boolean;
  className?: string;
  title?: string;
}

export default function LandedCostCard({
  calculation,
  compact = false,
  className = "",
  title = "Landed Cost & Conventional Material Comparison",
}: LandedCostCardProps) {
  const [showItemized, setShowItemized] = useState(!compact);

  const {
    quantityT,
    items,
    reusableLandedCostPerT,
    reusableTotalCost,
    reusableLogisticsPerT,
    isComplete,
    isDistanceEstimated,
    benchmark,
    virginLandedCostPerT,
    virginTotalCost,
    status,
    savingsPerT,
    totalSavings,
    savingsPercentage,
    statusMessage,
    disclaimer,
  } = calculation;

  const virginRate = virginLandedCostPerT ?? 0;
  const reusableRate = reusableLandedCostPerT ?? 0;
  const maxBarValue = Math.max(virginRate, reusableRate, 1);
  const reusableBarPct = Math.min(100, Math.round((reusableRate / maxBarValue) * 100));
  const virginBarPct = Math.min(100, Math.round((virginRate / maxBarValue) * 100));

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#d6dfd7] bg-white shadow-xs dark:border-steel-800 dark:bg-[#15231a] ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e8e2] bg-[#f5f8f5] px-4 py-3 dark:border-steel-800 dark:bg-[#1a2c20]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1f5631]/10 text-sm font-bold text-[#1f5631] dark:bg-[#00e599]/15 dark:text-[#00e599]">
            ₹
          </div>
          <div>
            <h4 className="font-archivo text-sm font-bold text-[#1a2e21] dark:text-white">
              {title}
            </h4>
            <span className="text-[11px] text-[#607163] dark:text-gray-400">
              Evaluated for {quantityT.toLocaleString("en-IN")} tonnes specification
            </span>
          </div>
        </div>

        <div>
          {status === "complete" && savingsPercentage !== null && savingsPercentage > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1b5e32] px-2.5 py-1 text-xs font-bold text-white shadow-xs dark:bg-[#00e599] dark:text-[#0c1811]">
              ★ ~{savingsPercentage}% Lower Cost
            </span>
          )}
          {status === "pricing_pending" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3d6] px-2.5 py-1 text-xs font-semibold text-[#875312] dark:bg-[#4a3416] dark:text-[#e9b86f]">
              Base Price Pending Quote
            </span>
          )}
          {status === "benchmark_unavailable" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf1ed] px-2.5 py-1 text-xs font-medium text-[#506053] dark:bg-white/10 dark:text-gray-300">
              Custom Material Benchmark N/A
            </span>
          )}
          {status === "cost_premium" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf0ed] px-2.5 py-1 text-xs font-semibold text-[#9e3a24] dark:bg-[#4a1c14] dark:text-[#f3a492]">
              Cost Premium
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Comparison Tri-Card Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* 1. Conventional Virgin Benchmark */}
          <div className="flex flex-col justify-between rounded-xl border border-[#e2e7df] bg-[#f9faf8] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#69796e] dark:text-gray-400">
                Virgin Material Benchmark
              </span>
              <p className="mt-1 font-archivo text-xl font-bold text-[#1d3524] dark:text-white">
                {benchmark ? formatINRPerT(benchmark.landedCostPerT) : "Unavailable"}
              </p>
              {benchmark && (
                <p className="text-xs text-[#526456] dark:text-gray-300">
                  Total {formatINR(virginTotalCost ?? 0)}
                </p>
              )}
            </div>
            <div className="mt-2.5 border-t border-[#e6ebe3] pt-2 text-[10px] text-[#6d7e72] dark:border-steel-800 dark:text-gray-400">
              {benchmark ? (
                <>
                  <span className="block font-medium truncate">{benchmark.name}</span>
                  <span className="block text-[9px] text-[#819286] truncate" title={benchmark.source}>
                    Source: {benchmark.source}
                  </span>
                </>
              ) : (
                <span>No defensible market benchmark published for custom specification.</span>
              )}
            </div>
          </div>

          {/* 2. Reclaimed Landed Cost */}
          <div className="flex flex-col justify-between rounded-xl border border-[#cbe3d1] bg-[#f1f8f3] p-3 dark:border-[#2f5e3e] dark:bg-[#1a3825]/40">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#265d34] dark:text-[#9de4b2]">
                GreenLoop Landed Cost
              </span>
              <p className="mt-1 font-archivo text-xl font-bold text-[#1a5b30] dark:text-[#00e599]">
                {reusableLandedCostPerT !== null
                  ? formatINRPerT(reusableLandedCostPerT)
                  : `~${formatINRPerT(reusableLogisticsPerT)} (logistics only)`}
              </p>
              <p className="text-xs text-[#396944] dark:text-gray-300">
                {reusableTotalCost !== null
                  ? `Total ${formatINR(reusableTotalCost)}`
                  : "Base asset quote pending"}
              </p>
            </div>
            <div className="mt-2.5 border-t border-[#d3e5d7] pt-2 text-[10px] text-[#4d7356] dark:border-[#2f5e3e] dark:text-gray-300">
              <span>
                {isComplete
                  ? "Includes asset price, transit haulage, and facility intake"
                  : "Material base price pending quote; logistics charges accounted"}
              </span>
              {isDistanceEstimated && (
                <span className="block text-[9px] text-[#719579]">
                  Transit distance unconfirmed — haulage is estimated
                </span>
              )}
            </div>
          </div>

          {/* 3. Estimated Savings Delta */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d6dfd7] bg-white p-3 shadow-2xs dark:border-steel-800 dark:bg-[#16251b]">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#637567] dark:text-gray-400">
                Estimated Net Savings
              </span>
              <p className="mt-1 font-archivo text-xl font-bold text-[#1a3827] dark:text-white">
                {totalSavings !== null && totalSavings > 0
                  ? formatINR(totalSavings)
                  : totalSavings !== null && totalSavings < 0
                    ? `-${formatINR(Math.abs(totalSavings))}`
                    : "—"}
              </p>
              <p className="text-xs font-semibold text-[#1e5d32] dark:text-[#00e599]">
                {savingsPerT !== null && savingsPerT > 0
                  ? `Save ${formatINRPerT(savingsPerT)}`
                  : savingsPerT !== null && savingsPerT < 0
                    ? `Premium ${formatINRPerT(Math.abs(savingsPerT))}`
                    : "Pending quote"}
              </p>
            </div>
            <div className="mt-2.5 border-t border-[#e2e7df] pt-2 text-[10px] text-[#637567] dark:border-steel-800 dark:text-gray-400">
              {savingsPercentage !== null && savingsPercentage > 0 ? (
                <span className="font-semibold text-[#1e5d32] dark:text-[#8fe0a4]">
                  ✓ ~{savingsPercentage}% savings vs. new equivalent
                </span>
              ) : status === "pricing_pending" ? (
                <span>Quote pending from provider</span>
              ) : (
                <span>Benchmark comparison unavailable</span>
              )}
            </div>
          </div>
        </div>

        {/* Visual Bar Comparison (when both rates available) */}
        {benchmark && reusableLandedCostPerT !== null && (
          <div className="space-y-1.5 rounded-xl border border-[#e6ebe3] bg-[#fafbf9] p-3 text-xs dark:border-steel-800 dark:bg-white/[0.015]">
            <div className="flex items-center justify-between text-[11px] text-[#556959] dark:text-gray-400">
              <span>Cost per Tonne Benchmark (₹)</span>
              <span>
                Reclaimed {formatINRPerT(reusableRate)} vs Virgin {formatINRPerT(virginRate)}
              </span>
            </div>

            {/* Virgin Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#6d7e71] dark:text-gray-400">Virgin Equivalent</span>
                <span className="font-mono font-medium">{formatINR(virginRate)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e3e8e1] dark:bg-steel-800">
                <div
                  className="h-full rounded-full bg-[#758679] dark:bg-steel-500 transition-all duration-500"
                  style={{ width: `${virginBarPct}%` }}
                />
              </div>
            </div>

            {/* Reclaimed Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-[#1e5b31] dark:text-[#00e599]">GreenLoop Reclaimed</span>
                <span className="font-mono font-bold text-[#1e5b31] dark:text-[#00e599]">
                  {formatINR(reusableRate)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e3e8e1] dark:bg-steel-800">
                <div
                  className="h-full rounded-full bg-[#2a7b45] dark:bg-[#00e599] transition-all duration-500"
                  style={{ width: `${reusableBarPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Status Explanation Message */}
        <p className="text-xs text-[#4c5f50] dark:text-gray-300 leading-relaxed">
          {statusMessage}
        </p>

        {/* Itemized Landed Cost Breakdown Toggle & Section */}
        <div className="border-t border-[#e2e7df] pt-3 dark:border-steel-800">
          <button
            type="button"
            onClick={() => setShowItemized((prev) => !prev)}
            className="flex w-full items-center justify-between text-xs font-bold text-[#235832] hover:text-[#184524] dark:text-[#8fe0a4] dark:hover:text-[#b4f0c4]"
          >
            <span>{showItemized ? "Hide Itemized Landed Cost Breakdown" : "View Itemized Landed Cost Breakdown"}</span>
            <span className="text-xs font-mono">{showItemized ? "▲" : "▼"}</span>
          </button>

          {showItemized && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e6ece4] text-[10px] font-bold uppercase tracking-wider text-[#69796e] dark:border-steel-800 dark:text-gray-400">
                    <th className="pb-1.5">Cost Component</th>
                    <th className="pb-1.5 text-right">Rate / Tonne</th>
                    <th className="pb-1.5 text-right">Total ({quantityT.toLocaleString("en-IN")} t)</th>
                    <th className="pb-1.5 pl-3">Basis &amp; Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1eb] dark:divide-steel-800/60">
                  {items.map((item) => (
                    <tr key={item.key} className="py-2">
                      <td className="py-2 font-medium text-[#1c3222] dark:text-white">
                        {item.label}
                      </td>
                      <td className="py-2 text-right font-mono text-[#25392b] dark:text-gray-200">
                        {item.ratePerT !== null ? formatINRPerT(item.ratePerT) : "Pending quote"}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-[#1a3827] dark:text-white">
                        {item.totalCost !== null ? formatINR(item.totalCost) : "—"}
                      </td>
                      <td className="py-2 pl-3 text-[11px] text-[#5e7162] dark:text-gray-400">
                        {item.note}
                        {item.isEstimated && (
                          <span className="ml-1 inline-block rounded bg-[#fef5e7] px-1.5 py-0.2 text-[9px] font-bold text-[#8a5518] dark:bg-[#4a3416] dark:text-[#e9b86f]">
                            Estimated
                          </span>
                        )}
                        {item.missing && (
                          <span className="ml-1 inline-block rounded bg-[#fdf0ed] px-1.5 py-0.2 text-[9px] font-bold text-[#9e3a24] dark:bg-[#4a1c14] dark:text-[#f3a492]">
                            Missing quote
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#d8e2d7] font-bold text-[#163821] dark:border-steel-700 dark:text-white">
                    <td className="pt-2">Total Reclaimed Landed Cost</td>
                    <td className="pt-2 text-right font-mono">
                      {reusableLandedCostPerT !== null
                        ? formatINRPerT(reusableLandedCostPerT)
                        : "Quote pending"}
                    </td>
                    <td className="pt-2 text-right font-mono text-sm text-[#18532b] dark:text-[#00e599]">
                      {reusableTotalCost !== null ? formatINR(reusableTotalCost) : "Quote pending"}
                    </td>
                    <td className="pt-2 pl-3 text-[11px] text-[#4d6352] dark:text-gray-300">
                      {isComplete ? "Full itemized delivery estimate" : "Excludes unquoted material base price"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Benchmark Source & Transparency Disclaimer */}
        <div className="rounded-xl border border-[#e5ebe3] bg-[#f8faf7] p-2.5 text-[10px] text-[#5e6f62] dark:border-steel-800 dark:bg-white/[0.015] dark:text-gray-400">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-1 font-medium text-[#2d4b35] dark:text-gray-300">
            <span>
              Benchmark Reference: {benchmark ? benchmark.specification : "Custom Specification"}
            </span>
            {benchmark && <span>Source: {benchmark.source}</span>}
          </div>
          <p className="leading-tight opacity-90">{disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
