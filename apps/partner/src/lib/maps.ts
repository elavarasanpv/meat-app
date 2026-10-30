import { Linking } from "react-native";

type Point = { lat: number | null | undefined; lng: number | null | undefined };

/**
 * Open Google Maps turn-by-turn to a destination, optionally via stops in
 * order. Free, works offline-cached, no API key — the rider gets real road
 * routing without us paying for a Directions API.
 */
export function navigateTo(dest: Point, via: Point[] = []) {
  if (dest.lat == null || dest.lng == null) return;
  const waypoints = via.filter((p) => p.lat != null && p.lng != null).map((p) => `${p.lat},${p.lng}`);
  const url =
    `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving` +
    (waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join("|"))}` : "");
  Linking.openURL(url).catch(() => {});
}

export function callNumber(phone: string | null | undefined) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
