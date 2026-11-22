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
/** Under this distance the customer gets the "arriving soon" push (about two minutes out). */
export const NEARING_KM = 0.5;

/**
 * Rough ETA range in whole minutes, e.g. [6, 9]. Range on purpose: never falsely precise.
 * With the real road distance left (from the route) the guess is better, so the range is narrower.
 */
export function etaMinutesRange(straightKm: number, roadKm?: number | null): [number, number] {
  const known = roadKm != null;
  const minutes = ((known ? roadKm : straightKm * ROAD_FACTOR) / AVG_RIDER_SPEED_KMH) * 60;
  const lo = Math.max(1, Math.floor(minutes * (known ? 0.9 : 0.8)));
  const hi = Math.max(lo + 1, Math.ceil(minutes * (known ? 1.15 : 1.25)));
  return [lo, hi];
}

/** Road distance left along a route: from the route point nearest `from` to its end, plus the hop onto it. */
export function roadKmLeft(from: { lat: number; lng: number }, route: { lat: number; lng: number }[]): number | null {
  if (route.length < 2) return null;
  let nearest = 0;
  let best = Infinity;
  route.forEach((p, i) => {
    const d = haversineKm(from, p);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  let km = best;
  for (let i = nearest + 1; i < route.length; i++) km += haversineKm(route[i - 1], route[i]);
  return km;
}
