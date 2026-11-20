import { View } from "react-native";
import type { OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { useT, type TKey } from "@/i18n";
import { palette, useTheme } from "@/theme";

/** Small pill with the order status in the right colour family. */
/** Grocery: accept and pack are one step for the shop, so the in-shop statuses all read "Packing". */
const GROCERY_LABEL: Partial<Record<OrderStatus, TKey>> = { ACCEPTED: "stg_packing", PACKING: "stg_packing", PACKED: "stg_packing" };

export function StatusBadge({ status, vertical }: { status: OrderStatus; vertical?: "meat" | "grocery" }) {
  const { c, scheme } = useTheme();
  // Problem states keep the brand red even inside the green grocery accent.
  const red = palette[scheme === "dark" ? "dark" : "light"];
  const t = useT();
  const tone =
    status === "DELIVERED"
      ? { bg: c.successBg, fg: c.successText }
      : status === "CANCELLED" || status === "DELIVERY_FAILED" || status === "RETURNED" || status === "REFUNDED"
        ? { bg: red.tint, fg: red.price }
        : status === "OUT_FOR_DELIVERY" || status === "PICKED_UP" || status === "RIDER_ASSIGNED"
          ? { bg: c.infoBg, fg: c.infoText }
          : { bg: c.warningBg, fg: c.warningText };
  return (
    <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 8, backgroundColor: tone.bg, justifyContent: "center" }}>
      <AppText variant="label" color={tone.fg} numberOfLines={1} style={{ fontSize: 11 }}>
        {t((vertical === "grocery" && GROCERY_LABEL[status]) || (`st_${status}` as TKey))}
      </AppText>
    </View>
  );
}
