import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = L.divIcon({
  className: "",
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#E4461F;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

type LatLng = { lat: number; lng: number };

/** Click the map or drag the pin to set a point. OpenStreetMap tiles, no key needed. */
export function MapPin({ value, center, onChange, height = 240 }: { value: LatLng | null; center: LatLng; onChange: (v: LatLng) => void; height?: number }) {
  const start = value ?? center;
  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ height }}>
      <MapContainer center={[start.lat, start.lng]} zoom={value ? 16 : 13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickToSet onChange={onChange} />
        <Follow to={value} />
        {value && <DraggablePin value={value} onChange={onChange} />}
      </MapContainer>
    </div>
  );
}

function ClickToSet({ onChange }: { onChange: (v: LatLng) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }) });
  return null;
}
function Follow({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to && !map.getBounds().contains([to.lat, to.lng])) map.setView([to.lat, to.lng], 16);
  }, [to, map]);
  return null;
}
function DraggablePin({ value, onChange }: { value: LatLng; onChange: (v: LatLng) => void }) {
  const handlers = useMemo(
    () => ({
      dragend(e: L.LeafletEvent) {
        const p = (e.target as L.Marker).getLatLng();
        onChange({ lat: round(p.lat), lng: round(p.lng) });
      },
    }),
    [onChange],
  );
  return <Marker position={[value.lat, value.lng]} icon={pin} draggable eventHandlers={handlers} />;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Pull "lat,lng" out of a pasted Google Maps link or plain coordinates. */
export function parseLatLng(text: string): LatLng | null {
  const m = text.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ?? text.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ?? text.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: round(lat), lng: round(lng) } : null;
}
