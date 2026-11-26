import { View } from "react-native";
import type { OrderStatus } from "@thanjozmart/shared";
import { AppText } from "./AppText";
import { useT, type TKey } from "@/i18n";
import { palette, useTheme } from "@/theme";

/** Small pill with the order status in the right colour family. */
/** Grocery: accept and pack are one step for the shop, so the in-shop statuses all read "Packing". */
const GROCERY_LABEL: Partial<Record<OrderStatus, TKey>> = { ACCEPTED: "stg_packing", PACKING: "stg_packing", PACKED: "stg_packing" };

/** The words for a status ("Delivered", "Packing"...). */
export function statusKey(status: OrderStatus, vertical?: "meat" | "grocery"): TKey {
  return (vertical === "grocery" && GROCERY_LABEL[status]) || (`st_${status}` as TKey);
}

export type StatusKind = "done" | "problem" | "moving" | "waiting";
export function statusKind(status: OrderStatus): StatusKind {
  if (status === "DELIVERED") return "done";
  if (status === "CANCELLED" || status === "DELIVERY_FAILED" || status === "RETURNED" || status === "REFUNDED") return "problem";
  if (status === "OUT_FOR_DELIVERY" || status === "PICKED_UP" || status === "RIDER_ASSIGNED") return "moving";
  return "waiting";
}

/** Background and text colour for a status, in the right colour family. */
export function useStatusTone(status: OrderStatus): { bg: string; fg: string } {
  const { c, scheme } = useTheme();
  // Problem states keep the brand red even inside the green grocery accent.
  const red = palette[scheme === "dark" ? "dark" : "light"];
  const kind = statusKind(status);
  return kind === "done"
    ? { bg: c.successBg, fg: c.successText }
    : kind === "problem"
      ? { bg: red.tint, fg: red.price }
      : kind === "moving"
        ? { bg: c.infoBg, fg: c.infoText }
        : { bg: c.warningBg, fg: c.warningText };
}

export function StatusBadge({ status, vertical }: { status: OrderStatus; vertical?: "meat" | "grocery" }) {
  const t = useT();
  const tone = useStatusTone(status);
  return (
    <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 8, backgroundColor: tone.bg, justifyContent: "center" }}>
      <AppText variant="label" color={tone.fg} numberOfLines={1} style={{ fontSize: 11 }}>
        {t(statusKey(status, vertical))}
      </AppText>
    </View>
  );
}
