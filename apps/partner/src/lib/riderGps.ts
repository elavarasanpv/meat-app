import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api } from "./api";

/**
 * Rider GPS: one queue, two ways in.
 *  • Background task (own APK): keeps reporting with the screen off, shown as
 *    the Android "sharing your location during delivery" notification.
 *  • Foreground watcher (Expo Go, or if "allow all the time" was refused).
 * Every fix goes into an on-phone queue and is sent in batches; when the
 * network drops the queue just grows, and the next send catches up — so the
 * trip's km log stays complete on 2G.
 */

export const GPS_TASK = "freshcut-rider-gps";
const QUEUE_KEY = "rider-gps-queue";
const MAX_QUEUE = 600; // ~3 h of fixes at 20 s
const ON_TRIP_MS = 20_000;
const IDLE_MS = 60_000;

type Fix = { lat: number; lng: number; heading?: number; speedKmh?: number; at: string };

let flushing = false;

function toFix(loc: Location.LocationObject): Fix {
  const { latitude, longitude, heading, speed } = loc.coords;
  return {
    lat: latitude,
    lng: longitude,
    heading: heading != null && heading >= 0 ? heading : undefined,
    speedKmh: speed != null && speed >= 0 ? Math.round(speed * 3.6) : undefined,
    at: new Date(loc.timestamp).toISOString(),
  };
}

async function enqueue(fixes: Fix[]) {
  if (!fixes.length) return;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: Fix[] = raw ? JSON.parse(raw) : [];
    const next = [...queue, ...fixes].slice(-MAX_QUEUE);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    /* storage full / unavailable: drop rather than crash */
  }
}

/** Send everything queued; keep it if the network is down. */
export async function flushGps() {
  if (flushing) return;
  flushing = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: Fix[] = raw ? JSON.parse(raw) : [];
    for (let i = 0; i < queue.length; i += 300) {
      await api("/rider/locations", { method: "POST", body: { points: queue.slice(i, i + 300) } });
    }
    if (queue.length) await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* offline or server down — try again with the next fix */
  } finally {
    flushing = false;
  }
}

async function record(locs: Location.LocationObject[]) {
  await enqueue(locs.map(toFix));
  await flushGps();
}

// Must be defined at module load (imported from the root layout) so Android
// can deliver locations to it even when the app was backgrounded.
if (!TaskManager.isTaskDefined(GPS_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await record(data.locations);
  });
}

let watcher: Location.LocationSubscription | null = null;
let backgroundOn = false;

/** Explain before asking for "Allow all the time" (Play Store requires a clear disclosure). */
function askBackgroundDisclosure(title: string, body: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) },
    ]),
  );
}

const BG_ASKED_KEY = "rider-bg-location-asked";
let starting: Promise<"background" | "foreground" | "denied"> | null = null;

/**
 * Start (or retune) tracking. `onTrip` sends every 20 s; idle-online every 60 s.
 * Foreground tracking starts first, so nothing waits on a permission dialog;
 * it is upgraded to the background task when "Allow all the time" is granted.
 * The disclosure + system prompt are shown once per install, never again.
 * Returns which mode is running so the UI can hint when screen-off tracking is off.
 */
export function startGps(onTrip: boolean, text: { title: string; body: string; notifTitle: string; notifBody: string }) {
  if (starting) return starting;
  starting = doStart(onTrip, text).finally(() => {
    starting = null;
  });
  return starting;
}

async function doStart(onTrip: boolean, text: { title: string; body: string; notifTitle: string; notifBody: string }): Promise<"background" | "foreground" | "denied"> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";
  const interval = onTrip ? ON_TRIP_MS : IDLE_MS;

  // 1. Foreground right away.
  if (!backgroundOn) {
    stopWatcher();
    watcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: interval, distanceInterval: 30 },
      (loc) => void record([loc]),
    );
    // Send a first fix now rather than waiting for movement.
    Location.getLastKnownPositionAsync().then((l) => l && record([l])).catch(() => {});
  }

  // 2. Upgrade to background when allowed (own build only; Expo Go throws).
  let bgOk = false;
  try {
    bgOk = (await Location.getBackgroundPermissionsAsync()).status === "granted";
    if (!bgOk) {
      const asked = await AsyncStorage.getItem(BG_ASKED_KEY).catch(() => "1");
      if (!asked) {
        await AsyncStorage.setItem(BG_ASKED_KEY, "1").catch(() => {});
        if (await askBackgroundDisclosure(text.title, text.body)) {
          bgOk = (await Location.requestBackgroundPermissionsAsync()).status === "granted";
        }
      }
    }
  } catch {
    bgOk = false;
  }
  if (!bgOk) return "foreground";

  try {
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: interval,
      distanceInterval: 30,
      deferredUpdatesInterval: interval,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: text.notifTitle, notificationBody: text.notifBody, notificationColor: "#E4461F", killServiceOnDestroy: false },
    });
    backgroundOn = true;
    stopWatcher(); // the background task now covers both screen-on and screen-off
    return "background";
  } catch {
    return "foreground"; // Expo Go: background updates aren't available
  }
}

function stopWatcher() {
  watcher?.remove();
  watcher = null;
}

/** Stop everything (going offline / logging out); sends what's left. */
export async function stopGps() {
  stopWatcher();
  if (backgroundOn) {
    backgroundOn = false;
    try {
      if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) await Location.stopLocationUpdatesAsync(GPS_TASK);
    } catch {
      /* not running */
    }
  }
  await flushGps();
}
