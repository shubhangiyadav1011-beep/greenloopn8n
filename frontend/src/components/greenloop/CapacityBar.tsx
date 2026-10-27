import { cn } from "@/utils";

/**
 * GreenLoop capacity bar — the product's signature visualization.
 * Flat segments: charcoal = confirmed tonnage, amber = held tonnage,
 * track = available. All figures computed by the caller from the engine.
 */
export default function CapacityBar({
  capacityT,
  reservedT,
  heldT,
  showLegend = true,
  className,
}: {
  capacityT: number;
  reservedT: number;
  heldT: number;
  showLegend?: boolean;
  className?: string;
}) {
  const safeCapacity = Math.max(capacityT, reservedT + heldT, 0.0001);
  const reservedPct = Math.min(100, (reservedT / safeCapacity) * 100);
  const heldPct = Math.min(100 - reservedPct, (heldT / safeCapacity) * 100);
  const availableT = Math.max(0, capacityT - reservedT - heldT);

  return (
    <div className={className}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-white/10"
        role="img"
        aria-label={`${reservedT.toFixed(1)} tonnes reserved, ${heldT.toFixed(1)} tonnes on hold, ${availableT.toFixed(1)} tonnes available of ${capacityT.toFixed(1)} tonnes`}
      >
        <div
          className="bg-loop-600 transition-all duration-500 dark:bg-loop-500"
          style={{ width: `${reservedPct}%` }}
        />
        <div
          className="bg-signal-500 transition-all duration-500"
          style={{ width: `${heldPct}%` }}
        />
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
          <LegendSwatch
            swatch="bg-loop-600 dark:bg-loop-500"
            label="Reserved"
            value={`${reservedT.toFixed(1)} t`}
          />
          {heldT > 0 && (
            <LegendSwatch swatch="bg-signal-500" label="Hold" value={`${heldT.toFixed(1)} t`} />
          )}
          <LegendSwatch
            swatch="bg-gray-200 dark:bg-white/10"
            label="Available"
            value={`${availableT.toFixed(1)} t`}
            valueClass="text-steel-700 dark:text-steel-300"
          />
          <LegendSwatch
            swatch="bg-transparent ring-1 ring-steel-300 dark:ring-steel-700"
            label="Total"
            value={`${capacityT.toFixed(1)} t`}
            valueClass="font-semibold text-ink-900 dark:text-white/90"
          />
        </div>
      )}
    </div>
  );
}

function LegendSwatch({
  swatch,
  label,
  value,
  valueClass,
}: {
  swatch: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} aria-hidden="true" />
      <span className="text-theme-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cn("ledger-numeral text-theme-xs font-medium text-gray-700 dark:text-gray-300", valueClass)}>
        {value}
      </span>
    </span>
  );
}
