import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Alert = {
  id: string;
  kind: "no_shop" | "late" | "waiting_rider" | "cash_count" | "failed" | "cancelled" | "shop_declined";
  severity: "urgent" | "warn" | "info";
  open: boolean;
  title: string;
  body: string;
  at: string;
  link: string;
};

const KEY = "fc-admin-alerts-seen";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "1970-01-01T00:00:00Z";
  } catch {
    return "1970-01-01T00:00:00Z";
  }
};

/** Live alerts. Open ones always count; updates count until you've seen them. */
export function useAlerts() {
  const q = useQuery<Alert[]>({ queryKey: ["admin", "notifications"], queryFn: () => api("/admin/notifications"), refetchInterval: 30_000 });
  const [seen, setSeen] = useState(read);
  useEffect(() => {
    const h = () => setSeen(read());
    window.addEventListener("fc-alerts-seen", h);
    return () => window.removeEventListener("fc-alerts-seen", h);
  }, []);
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(KEY, now);
    } catch {
      /* private mode: badge just won't remember */
    }
    window.dispatchEvent(new Event("fc-alerts-seen"));
  }, []);
  const alerts = q.data ?? [];
  const isNew = (a: Alert) => !a.open && a.at > seen;
  const unread = alerts.filter((a) => a.open || isNew(a)).length;
  return { ...q, alerts, unread, isNew, markSeen };
}
