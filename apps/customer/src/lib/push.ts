import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as NotificationsT from "expo-notifications";
import { supabase } from "./supabase";

/**
 * Customer push: "your rider has arrived" with FreshCut's happy jingle, even
 * when the app is closed. Works in the real APK (Firebase configured); Expo Go
 * on Android has no remote push, so the module isn't even loaded there.
 */
export const pushAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const Notifications: typeof NotificationsT | null = pushAvailable ? require("expo-notifications") : null;

/** Android channel the server targets ("delivery"). Its sound is fixed at creation — new id to change it. */
export const DELIVERY_CHANNEL = "delivery";

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // the open order screen plays the jingle itself
    shouldSetBadge: false,
  }),
});

export async function registerForPush(channelName: string): Promise<{ token: string | null; reason?: string }> {
  if (!Notifications) return { token: null, reason: "expo-go" };
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(DELIVERY_CHANNEL, {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
        sound: "freshcut_arrived.wav",
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return { token: null, reason: "denied" };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { token: null, reason: "no-eas-project" };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (uid) await supabase.from("push_tokens").upsert({ profile_id: uid, token, platform: Platform.OS, updated_at: new Date().toISOString() });
    return { token };
  } catch (e) {
    return { token: null, reason: (e as Error).message };
  }
}

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
