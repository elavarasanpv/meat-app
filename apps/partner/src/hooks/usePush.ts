import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Notifications, registerForPush } from "@/lib/push";
import { useT } from "@/i18n";

/**
 * Register this phone for alerts once logged in, and route taps:
 * a shop's "new order" opens Orders › New; a rider's "new delivery" opens
 * Tasks (the offer popup is already on top). Data is refetched on arrival.
 */
export function usePush(role: "dealer" | "rider") {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useT();

  useEffect(() => {
    registerForPush(t("pushChannelName")).catch(() => {});
  }, []);

  useEffect(() => {
    if (!Notifications) return;
    const go = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      if (data.kind === "new_order" && role === "dealer") router.push({ pathname: "/(tabs)/orders", params: { seg: "new", at: String(Date.now()) } });
      if (data.kind === "offer" && role === "rider") router.push("/rider/tasks");
    };
    const received = Notifications.addNotificationReceivedListener(() => {
      qc.invalidateQueries({ queryKey: [role] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
    // Opened from a notification while the app was closed.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && go(r.notification.request.content.data))
      .catch(() => {});
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [role]);
}
