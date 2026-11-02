import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import riderIcon from "@freshcut/assets/images/icon-rider.png";
import shopIcon from "@freshcut/assets/images/icon-shop.png";

export type LatLng = { lat: number; lng: number };
export type Stop = { id: string; displayId: string; status: string; customer: string; at: LatLng | null; shop: { name: string; at: LatLng | null } | null };

const img = (src: string, bg: string, size: number, ring = "#fff") =>
  L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid ${ring};box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><img src="${src}" alt="" style="height:${Math.round(size * 0.58)}px;width:auto;filter:brightness(0) invert(1)" /></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const riderPin = img(riderIcon, "#E4461F", 44);
const shopPin = img(shopIcon, "#1C1715", 34);
const homePin = (n: number, done: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${done ? "#1E8A4F" : "#2F6FD1"};color:#fff;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:800 12px Manrope,sans-serif">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

/** Rider's live position, today's trail and the stops they're carrying. */
export function RiderLiveMap({ position, trail, stops, height = 320 }: { position: LatLng | null; trail: [number, number][]; stops: Stop[]; height?: number }) {
  const points = useMemo(() => {
    const p: [number, number][] = [...trail];
    if (position) p.push([position.lat, position.lng]);
    for (const s of stops) {
      if (s.at) p.push([s.at.lat, s.at.lng]);
      if (s.shop?.at) p.push([s.shop.at.lat, s.shop.at.lng]);
    }
    return p;
  }, [position, trail, stops]);
  const center: [number, number] = position ? [position.lat, position.lng] : points[0] ?? [8.2555, 77.6655];
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; at: LatLng }>();
    for (const s of stops) if (s.shop?.at) m.set(s.shop.name, { name: s.shop.name, at: s.shop.at });
    return [...m.values()];
  }, [stops]);

  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit points={points} />
        {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: "#E4461F", weight: 4, opacity: 0.75, lineJoin: "round" }} />}
        {shops.map((s) => (
          <Marker key={s.name} position={[s.at.lat, s.at.lng]} icon={shopPin} title={s.name} />
        ))}
        {stops.map((s, i) => s.at && <Marker key={s.id} position={[s.at.lat, s.at.lng]} icon={homePin(i + 1, s.status === "DELIVERED")} title={`${s.displayId} · ${s.customer}`} />)}
        {position && <Marker position={[position.lat, position.lng]} icon={riderPin} zIndexOffset={1000} />}
      </MapContainer>
    </div>
  );
}

/** Fit everything once per set of points, without fighting the user's own panning. */
function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.length ? `${points.length}:${points[0]}:${points[points.length - 1]}` : "";
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    else if (points.length === 1) map.setView(points[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}
