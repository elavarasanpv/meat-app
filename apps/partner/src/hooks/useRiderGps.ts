import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { api } from "@/lib/api";

/** Send a fix at most this often while online (2G-friendly; the map interpolates). */
const MIN_INTERVAL_MS = 20_000;
const MIN_DISTANCE_M = 40;

/**
 * Foreground GPS while the rider is online: watches position and POSTs it to
 * /rider/location. Expo Go cannot track with the screen off; the dev build
 * (R4) adds background updates on top of this same hook.
 */
export function useRiderGps(online: boolean | undefined) {
  const sub = useRef<Location.LocationSubscription | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      sub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: MIN_INTERVAL_MS, distanceInterval: MIN_DISTANCE_M },
        (pos) => {
          const now = Date.now();
          if (now - lastSent.current < MIN_INTERVAL_MS) return;
          lastSent.current = now;
          api("/rider/location", {
            method: "POST",
            body: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : undefined,
              speedKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : undefined,
            },
          }).catch(() => {});
        },
      );
    }
    if (online) start();
    return () => {
      cancelled = true;
      sub.current?.remove();
      sub.current = null;
    };
  }, [online]);
}
