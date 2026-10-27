import { useState, type ReactNode } from "react";
import { cn } from "@/utils";

/**
 * Compact discovery-page control: [ Search ] [ Filters ] … [actions].
 *
 * The filter panel is CLOSED by default so the page leads with its content.
 * Existing filter fields are passed unchanged as `filters`; opening the panel
 * reveals exactly the filters the page had before — nothing is removed.
 */
export default function SearchFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchLabel = "Search",
  filters,
  activeFilterCount = 0,
  onClearFilters,
  resultLabel,
  actions,
  className,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Existing filter fields, rendered inside the expandable panel. */
  filters: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  resultLabel?: ReactNode;
  /** Right-aligned controls after Filters (e.g. sort select, view toggle). */
  actions?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-[300px]">
          <span className="sr-only">{searchLabel}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-steel-400"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <input
            type="search"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-control border border-steel-300 bg-white ps-9 pe-3 text-sm text-ink-900 outline-none transition focus:border-loop-500 focus:ring-2 focus:ring-loop-500/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
          />
        </label>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border px-detail text-sm font-semibold transition-colors",
            open
              ? "border-loop-600 bg-loop-50 text-loop-800 dark:border-loop-500/60 dark:bg-loop-500/10 dark:text-loop-200"
              : "border-steel-300 bg-white text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-gray-200 dark:hover:bg-white/[0.05]",
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4"><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" /></svg>
          Filters
          {activeFilterCount > 0 && (
            <span className={cn(
              "ledger-numeral inline-flex size-4.5 items-center justify-center rounded-full text-xs font-bold",
              open ? "bg-loop-600 text-white" : "bg-loop-600 text-white dark:bg-loop-500",
            )}>{activeFilterCount}</span>
          )}
        </button>
        {resultLabel && <p className="ms-auto text-xs font-medium text-steel-500 dark:text-gray-400">{resultLabel}</p>}
        {actions && <div className="ms-auto flex shrink-0 items-center gap-2 empty:hidden">{actions}</div>}
      </div>
      {open && (
        <div className="mt-3 border border-steel-200 bg-white p-4 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <div className="grid gap-detail sm:grid-cols-2 xl:grid-cols-4">{filters}</div>
          {onClearFilters && (
            <div className="mt-3 border-t border-steel-100 pt-3 dark:border-steel-800/60">
              <button type="button" onClick={onClearFilters} className="text-xs font-semibold text-loop-700 underline underline-offset-2 dark:text-loop-300">Clear all filters</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
