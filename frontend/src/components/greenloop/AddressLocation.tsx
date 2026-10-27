import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoPoint } from "@shared/domain/types";
import { LocationMap } from "@/components/greenloop/LocationMap";
import { cn } from "@/utils";

type Suggestion = { label: string; geo?: GeoPoint; source: "greenloop" | "osm" };

/**
 * Compact, Swiggy-style address field: type → suggestions → select → small map preview.
 *
 * Suggestions combine addresses GreenLoop already knows (via `sources`) with the
 * public OpenStreetMap Nominatim search endpoint (no API key, no new dependency).
 * The written address remains the source of truth; coordinates are optional
 * metadata and persist through the existing backend geo validation.
 */
export default function AddressLocation({
  address,
  onAddressChange,
  geo,
  onGeoChange,
  sources = [],
  placeholder = "Search address…",
  label = "Location",
  required = false,
  showMapPreview = true,
  className = "",
  inputClassName = "",
}: {
  address: string;
  onAddressChange: (value: string) => void;
  geo?: GeoPoint;
  onGeoChange: (geo?: GeoPoint) => void;
  /** Addresses already known to GreenLoop, offered as first-class suggestions. */
  sources?: string[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  showMapPreview?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<{ query: string; results: Suggestion[]; unavailable: boolean }>({ query: "", results: [], unavailable: false });
  const osmResults = lookup.query === address.trim() ? lookup.results : [];
  const osmUnavailable = lookup.query === address.trim() && lookup.unavailable;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const query = address.trim();
    if (query.length < 4) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
        if (controller.signal.aborted) return;
        setLookup({ query, unavailable: false, results: data.map(item => ({ label: item.display_name, geo: { lat: Number(item.lat), lng: Number(item.lon) }, source: "osm" as const })) });
      } catch (cause) {
        if ((cause as Error | undefined)?.name !== "AbortError") {
          setLookup({ query, results: [], unavailable: true });
        }
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [address]);

  const local = useMemo(() => {
    const query = address.trim().toLowerCase();
    if (!query) return [] as Suggestion[];
    return [...new Set(sources.filter(Boolean))]
      .filter(source => source.toLowerCase().includes(query) && source.toLowerCase() !== query)
      .slice(0, 4)
      .map(labelValue => ({ label: labelValue, source: "greenloop" as const }));
  }, [address, sources]);

  const suggestions = [...local, ...osmResults.filter(item => !local.some(item2 => item2.label === item.label))];

  const choose = (suggestion: Suggestion) => {
    onAddressChange(suggestion.label);
    onGeoChange(suggestion.geo);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-steel-700 dark:text-gray-300" htmlFor="address-location-input">
        {label}
        <span className="relative mt-1 block">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-steel-400"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <input
            id="address-location-input"
            type="text"
            value={address}
            required={required}
            autoComplete="off"
            onChange={event => {
              onAddressChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn("block h-10 w-full rounded-sm border-steel-300 bg-white ps-9 pe-3 text-sm shadow-sm outline-none focus:border-loop-500 focus:ring-loop-500 dark:border-steel-700 dark:bg-black dark:text-white", inputClassName)}
          />
        </span>
      </label>
      {open && (local.length > 0 || osmResults.length > 0) && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto border border-steel-200 bg-white shadow-lg dark:border-steel-700 dark:bg-[#101a13] rounded-surface" role="listbox" aria-label="Address suggestions">
          {suggestions.map(suggestion => (
            <li key={`${suggestion.source}-${suggestion.label}`}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => choose(suggestion)}
                className="flex w-full items-start gap-2 px-3 py-2 text-start text-xs leading-5 text-ink-800 transition-colors hover:bg-loop-50 dark:text-gray-200 dark:hover:bg-loop-500/10"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-0.5 size-3.5 shrink-0 text-steel-400"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                <span className="min-w-0">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && local.length === 0 && osmResults.length === 0 && address.trim().length >= 4 && (
        <p className="absolute z-30 mt-1 w-full border border-steel-200 bg-white px-3 py-2 text-xs text-steel-500 dark:border-steel-700 dark:bg-[#101a13] dark:text-gray-400 rounded-surface">
          {osmUnavailable ? "Address suggestions are unavailable offline — your typed address is kept as written." : "Searching addresses…"}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-4 text-steel-500 dark:text-gray-400">Type an address or pick a suggestion. The written address is the source of truth{geo ? "; the pin is stored as optional coordinates." : "; coordinates are optional."}</p>
      {showMapPreview && geo && (
        <div className="mt-2">
          <LocationMap geo={geo} size="sm" />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-steel-500 dark:text-gray-400">
            <span className="ledger-numeral">Pinned at {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</span>
            <button type="button" onClick={() => onGeoChange(undefined)} className="font-semibold underline underline-offset-2 hover:text-ink-800 dark:hover:text-white">Remove pin</button>
          </div>
        </div>
      )}
    </div>
  );
}
