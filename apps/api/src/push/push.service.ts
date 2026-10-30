import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  title: string;
  body: string;
  /** Read by the app when the notification is tapped (e.g. { kind: "offer", orderId }). */
  data?: Record<string, unknown>;
  /**
   * Android channel: "orders" is the partner app's loud chop-and-chime ring,
   * "delivery" the customer app's happy parcel jingle.
   */
  channelId?: "orders" | "delivery" | "default";
};

/**
 * Sends notifications through Expo's push service (which relays to Google's
 * FCM on Android). Fire-and-forget: a push failure never blocks an order.
 * Tokens Expo reports as no longer registered are deleted.
 */
@Injectable()
export class PushService {
  constructor(private readonly supabase: SupabaseService) {}

  async toProfiles(profileIds: string[], msg: PushMessage): Promise<{ sent: number; failed: number }> {
    const ids = [...new Set(profileIds)].filter(Boolean);
    if (!ids.length) return { sent: 0, failed: 0 };
    const { data: rows } = await this.supabase.admin.from("push_tokens").select("token").in("profile_id", ids);
    const tokens = [...new Set((rows ?? []).map((r) => r.token as string))].filter((t) => t.startsWith("ExponentPushToken["));
    return this.toTokens(tokens, msg);
  }

  async toTokens(tokens: string[], msg: PushMessage): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const messages = batch.map((to) => ({
        to,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: "default",
        priority: "high",
        channelId: msg.channelId ?? "orders",
        ttl: 300, // an order alert is useless after 5 minutes
      }));
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(messages),
        });
        const json = (await res.json()) as { data?: { status: string; details?: { error?: string }; message?: string }[] };
        const tickets = json.data ?? [];
        const dead: string[] = [];
        tickets.forEach((t, k) => {
          if (t.status === "ok") sent += 1;
          else {
            failed += 1;
            if (t.details?.error === "DeviceNotRegistered") dead.push(batch[k]);
            else console.warn("[push]", t.details?.error ?? t.message);
          }
        });
        if (dead.length) await this.supabase.admin.from("push_tokens").delete().in("token", dead);
      } catch (e) {
        failed += batch.length;
        console.warn("[push] send failed", (e as Error).message);
      }
    }
    return { sent, failed };
  }
}
