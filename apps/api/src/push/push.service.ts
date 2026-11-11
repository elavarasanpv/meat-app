import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  title: string;
  body: string;
  /** Tamil title/body, used for readers whose profile language is Tamil. */
  ta?: { title: string; body: string };
  /** Read by the app when the notification is tapped (e.g. { kind: "offer", orderId }). */
  data?: Record<string, unknown>;
  /**
   * Android channel: "orders" is the partner app's loud chop-and-chime ring,
   * "delivery" the customer app's happy parcel jingle.
   */
  channelId?: "orders" | "delivery" | "offers" | "default";
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
    const { data: rows } = await this.supabase.admin.from("push_tokens").select("token, profiles(lang)").in("profile_id", ids);
    return this.split((rows ?? []) as { token: string; profiles: unknown }[], msg);
  }

  /** Everyone with a given role (promos): tokens are read straight off the role, no id list needed. */
  async toRoles(roles: string[], msg: PushMessage): Promise<{ sent: number; failed: number }> {
    const { data: rows } = await this.supabase.admin.from("push_tokens").select("token, profiles!inner(lang, role)").in("profiles.role", roles);
    return this.split(rows ?? [], msg);
  }

  /** Sends English or Tamil to each token by its profile language. */
  private async split(rows: { token: string; profiles: unknown }[], msg: PushMessage) {
    const seen = new Set<string>();
    const en: string[] = [];
    const ta: string[] = [];
    for (const r of rows) {
      const token = r.token;
      if (!token.startsWith("ExponentPushToken[") || seen.has(token)) continue;
      seen.add(token);
      const lang = (r.profiles as { lang?: string } | null)?.lang;
      (lang === "ta" && msg.ta ? ta : en).push(token);
    }
    const [a, b] = await Promise.all([this.toTokens(en, msg), ta.length ? this.toTokens(ta, { ...msg, title: msg.ta!.title, body: msg.ta!.body }) : { sent: 0, failed: 0 }]);
    return { sent: a.sent + b.sent, failed: a.failed + b.failed };
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
        ttl: msg.channelId === "offers" ? 6 * 3600 : 300, // an order alert is useless after 5 minutes; a promo can wait for the phone
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
