/** Straight-line distance between two points in km (haversine). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Roads wind more than a straight line; tune from real trips later. */
export const ROAD_FACTOR = 1.4;
/** Average two-wheeler speed on rural roads, km/h. */
export const AVG_RIDER_SPEED_KMH = 22;
/** Under this distance we say "arriving now". */
export const ARRIVING_KM = 0.15;

/** Rough ETA range in whole minutes, e.g. [6, 9]. Range on purpose: never falsely precise. */
export function etaMinutesRange(straightKm: number): [number, number] {
  const minutes = ((straightKm * ROAD_FACTOR) / AVG_RIDER_SPEED_KMH) * 60;
  const lo = Math.max(1, Math.floor(minutes * 0.8));
  const hi = Math.max(lo + 1, Math.ceil(minutes * 1.25));
  return [lo, hi];
}
