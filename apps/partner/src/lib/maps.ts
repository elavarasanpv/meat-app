import { Linking, Platform } from "react-native";

type Point = { lat: number | null | undefined; lng: number | null | undefined };

/**
 * Open Google Maps turn-by-turn to a destination, optionally via stops in
 * order. Free, works offline-cached, no API key — the rider gets real road
 * routing without us paying for a Directions API.
 *
 * Two-wheeler routes (shortcuts and narrow roads a car can't take). On Android
 * a single stop starts voice navigation straight away; with stops on the way,
 * or without the Maps app, it opens the route to tap Start.
 */
export function navigateTo(dest: Point, via: Point[] = []) {
  if (dest.lat == null || dest.lng == null) return;
  const waypoints = via.filter((p) => p.lat != null && p.lng != null).map((p) => `${p.lat},${p.lng}`);
  const web =
    `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=two-wheeler` +
    (waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join("|"))}` : "");
  const openWeb = () => Linking.openURL(web).catch(() => {});
  if (Platform.OS === "android" && waypoints.length === 0) {
    // mode=l is Google Maps' two-wheeler mode.
    Linking.openURL(`google.navigation:q=${dest.lat},${dest.lng}&mode=l`).catch(openWeb);
    return;
  }
  void openWeb();
}

export function callNumber(phone: string | null | undefined) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}
