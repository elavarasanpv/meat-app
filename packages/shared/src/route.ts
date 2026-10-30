import { ON_THE_WAY_DETOUR_KM } from "./constants";
import { haversineKm } from "./geo";

export type LatLng = { lat: number; lng: number };

/** A later customer moves up only if they're reached at least this much sooner (ties keep age order). */
const MIN_GAIN_KM = 0.2;
export type StopInput = { id: string; createdAt: string; point: LatLng | null };

/** Km travelled from the shop to each stop's door, following `route` in order. */
function arrivalKm(shop: LatLng, route: StopInput[]): Map<string, number> {
  const out = new Map<string, number>();
  let prev = shop;
  let km = 0;
  for (const s of route) {
    if (!s.point) {
      out.set(s.id, km);
      continue;
    }
    km += haversineKm(prev, s.point);
    out.set(s.id, km);
    prev = s.point;
  }
  return out;
}

/**
 * Delivery order for one trip: oldest customer first, except a later customer
 * is moved ahead when their door is on the way — i.e. dropping them first
 * delays every customer they jump ahead of by at most `detourKm` — and only
 * when it actually helps (they're reached at least MIN_GAIN_KM sooner), so
 * customers at the same spot keep first-come order.
 *
 * Stops without coordinates keep their age order. Returns ids in order.
 */
export function sequenceStops(shop: LatLng, stops: StopInput[], detourKm = ON_THE_WAY_DETOUR_KM): string[] {
  let route = [...stops].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (let i = 1; i < route.length; i++) {
    const mover = route[i];
    if (!mover.point) continue;
    const before = arrivalKm(shop, route);
    // Try the earliest slot first: an on-the-way customer should be dropped as early as possible.
    for (let j = 0; j < i; j++) {
      const candidate = [...route.slice(0, j), mover, ...route.slice(j, i), ...route.slice(i + 1)];
      const after = arrivalKm(shop, candidate);
      const jumped = route.slice(j, i);
      const worst = Math.max(...jumped.map((s) => (after.get(s.id) ?? 0) - (before.get(s.id) ?? 0)));
      const gain = (before.get(mover.id) ?? 0) - (after.get(mover.id) ?? 0);
      if (worst <= detourKm && gain >= MIN_GAIN_KM) {
        route = candidate;
        break;
      }
    }
  }
  return route.map((s) => s.id);
}
