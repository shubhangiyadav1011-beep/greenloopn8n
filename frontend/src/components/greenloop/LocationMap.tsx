import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@shared/domain/types";

const INDIA: L.LatLngExpression = [20.5937, 78.9629];

type MapProps = { geo?: GeoPoint; className?: string; onChange?: (geo: GeoPoint) => void; size?: "sm" | "md" };

export function LocationMap({ geo, className = "", onChange, size = "md" }: MapProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const latitude = geo?.lat;
  const longitude = geo?.lng;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false }).setView(INDIA, 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    if (onChangeRef.current) instance.on("click", (event: L.LeafletMouseEvent) => onChangeRef.current?.({ lat: Number(event.latlng.lat.toFixed(6)), lng: Number(event.latlng.lng.toFixed(6)) }));
    return () => { instance.remove(); map.current = null; marker.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (latitude === undefined || longitude === undefined) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const point: L.LatLngExpression = [latitude, longitude];
    if (marker.current) marker.current.setLatLng(point);
    else marker.current = L.circleMarker(point, { radius: 7, color: "#315f3d", fillColor: "#6d9a73", fillOpacity: 0.9 }).addTo(map.current);
    map.current.setView(point, Math.max(map.current.getZoom(), 12));
  }, [latitude, longitude]);

  return <div ref={element} className={`${size === "sm" ? "h-28" : "h-56"} w-full border border-steel-200 bg-steel-100 dark:border-steel-700 ${className}`} role="application" aria-label={onChange ? "Choose a location on the map" : "Location map"} />;
}

export function LocationPicker({ geo, onChange, className }: { geo?: GeoPoint; onChange: (geo: GeoPoint) => void; className?: string }) {
  return <div className={className}>
    <LocationMap geo={geo} onChange={onChange} />
    <p className="mt-2 text-xs text-steel-600 dark:text-gray-400">{geo ? `Selected coordinates: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "Tap the map to add optional coordinates. Your written location remains the primary address."}</p>
  </div>;
}
