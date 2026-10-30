import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import type * as NotificationsT from "expo-notifications";
import { supabase } from "./supabase";

/** Expo Go on Android has no remote push; don't even load the module there (it logs an error). */
export const pushAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const Notifications: typeof NotificationsT | null = pushAvailable ? require("expo-notifications") : null;

/**
 * Push alerts for the partner app: the shop rings on a new order, riders ring
 * on a new delivery nearby — also when the app is closed or the phone locked.
 *
 * Works in our own APK (Firebase configured); Expo Go on Android can't receive
 * remote pushes, so registration there quietly does nothing.
 */

/** Android channel the server targets ("orders"): max importance, sound, long vibration. */
export const ORDERS_CHANNEL = "orders";
// Android fixes a channel's sound when it is first created; to change the sound later, use a new channel id.

// Show alerts even while the app is open (the offer popup also appears).
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // in the foreground the app plays its own sound with the popup
    shouldSetBadge: false,
  }),
});

async function ensureChannel(name: string) {
  if (Platform.OS !== "android" || !Notifications) return;
  await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL, {
    name,
    importance: Notifications.AndroidImportance.MAX,
    sound: "freshcut_order.wav", // bundled via the expo-notifications plugin
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    bypassDnd: false,
  });
}

/**
 * Ask permission, get this phone's push token and save it for the logged-in
 * user (push_tokens; RLS lets each user write only their own). Safe to call
 * on every launch. Returns the token or null with a reason.
 */
export async function registerForPush(channelName: string): Promise<{ token: string | null; reason?: string }> {
  if (!Notifications) return { token: null, reason: "expo-go" };
  try {
    await ensureChannel(channelName);
    if (!Device.isDevice && Platform.OS === "ios") return { token: null, reason: "simulator" };

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return { token: null, reason: "denied" };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { token: null, reason: "no-eas-project" };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return { token, reason: "no-session" };
    await supabase.from("push_tokens").upsert({ profile_id: uid, token, platform: Platform.OS, updated_at: new Date().toISOString() });
    return { token };
  } catch (e) {
    // Expo Go on Android, no Firebase config yet, or offline: alerts just stay off.
    return { token: null, reason: (e as Error).message };
  }
}

/** Forget this phone for the user (on logout) so alerts stop coming here. */
export async function unregisterPush() {
  if (!Notifications) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    /* nothing registered */
  }
}
