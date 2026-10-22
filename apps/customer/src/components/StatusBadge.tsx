import { View } from "react-native";
import type { OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { useT, type TKey } from "@/i18n";
import { useTheme } from "@/theme";

/** Small pill with the order status in the right colour family. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { c } = useTheme();
  const t = useT();
  const tone =
    status === "DELIVERED"
      ? { bg: c.successBg, fg: c.successText }
      : status === "CANCELLED" || status === "DELIVERY_FAILED" || status === "RETURNED" || status === "REFUNDED"
        ? { bg: c.tint, fg: c.price }
        : status === "OUT_FOR_DELIVERY" || status === "PICKED_UP" || status === "RIDER_ASSIGNED"
          ? { bg: c.infoBg, fg: c.infoText }
          : { bg: c.warningBg, fg: c.warningText };
  return (
    <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 8, backgroundColor: tone.bg, justifyContent: "center" }}>
      <AppText variant="label" color={tone.fg} numberOfLines={1} style={{ fontSize: 11 }}>
        {t(`st_${status}` as TKey)}
      </AppText>
    </View>
  );
}
