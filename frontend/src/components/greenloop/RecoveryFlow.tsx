import type { GreenLoopDataset } from "@shared/domain/types";
import { cn } from "@/utils";

/**
 * Recovery flow rail — the product workflow as live counts from the dataset:
 * how many material passports sit at each stage right now.
 */
export default function RecoveryFlow({ dataset }: { dataset: GreenLoopDataset }) {
  const surveyed = dataset.materials.filter((m) => m.status === "surveyed").length;
  const passportReady = dataset.materials.filter((m) => m.status === "passport-ready").length;
  const reserved = dataset.materials.filter((m) => m.status === "reserved").length;
  const dispatched = dataset.materials.filter((m) => m.status === "dispatched").length;
  const verified = dataset.materials.filter((m) => m.status === "verified").length;

  const stages = [
    { key: "survey", label: "Surveyed", count: surveyed, active: surveyed > 0 },
    { key: "match", label: "Matched", count: passportReady, active: passportReady > 0 },
    { key: "reserve", label: "Reserved", count: reserved, active: reserved > 0 },
    { key: "dispatch", label: "Dispatched", count: dispatched, active: dispatched > 0 },
    { key: "verify", label: "Verified", count: verified, active: verified > 0 },
  ];

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {stages.map((stage, index) => (
        <li
          key={stage.key}
          className={cn(
            "min-w-0 rounded-sm border p-2.5 xl:p-3",
            stage.active
              ? "border-loop-300 bg-loop-50/70 dark:border-loop-700/50 dark:bg-loop-900/15"
              : "border-steel-200 bg-steel-50 dark:border-steel-800 dark:bg-transparent",
          )}
        >
          <span
            className={cn(
              "font-mono text-xs font-bold tracking-[0.12em]",
              stage.active
                ? "text-loop-800 dark:text-loop-300"
                : "text-steel-500 dark:text-steel-500",
            )}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <h4
            className={cn(
              "mt-1 whitespace-nowrap font-archivo text-xs font-bold uppercase tracking-wide",
              stage.active
                ? "text-loop-900 dark:text-loop-200"
                : "text-steel-500 dark:text-steel-500",
            )}
          >
            {stage.label}
          </h4>
          <p
            className={cn(
              "ledger-numeral mt-2 flex items-baseline gap-1 whitespace-nowrap text-lg font-bold",
              stage.active
                ? "text-loop-800 dark:text-loop-300"
                : "text-gray-400 dark:text-steel-700",
            )}
          >
            {stage.count}
            <span className="font-sans text-xs font-normal text-gray-500 dark:text-gray-400">
              {stage.count === 1 ? "passport" : "passports"}
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}
