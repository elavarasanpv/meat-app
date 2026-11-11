import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Notifications, registerForPush } from "@/lib/push";
import { syncLangToProfile, useLang, useT } from "@/i18n";

/** Logged in: register this phone for delivery alerts; a tap opens that order. */
export function PushBridge() {
  const router = useRouter();
  const t = useT();
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    registerForPush(t("pushChannelName")).catch(() => {});
    void syncLangToProfile(lang); // pushes come in the language chosen on this phone
    if (!Notifications) return;
    const open = (data: Record<string, unknown> | undefined) => {
      if (data?.orderId) router.push(`/order/${String(data.orderId)}`);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && open(r.notification.request.content.data))
      .catch(() => {});
    return () => sub.remove();
  }, []);
  return null;
}
