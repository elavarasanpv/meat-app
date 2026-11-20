import { useEffect, useRef } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import type { OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";
import { useT, type TKey } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Grocery order tracker: a headline, the arrival window and a four-stop
 * line — placed · packed · rider · home. The shop's accept and pack are one
 * stop; a rider is rung the moment the shop accepts. Green via the Accent.
 */
const STOPS: { key: "placed" | "packed" | "rider" | "home"; icon: IconName }[] = [
  { key: "placed", icon: "receipt" },
  { key: "packed", icon: "cart" },
  { key: "rider", icon: "scooter" },
  { key: "home", icon: "home" },
];

/** Which stop is current for each status (reached stops are filled). */
const STOP_OF: Partial<Record<OrderStatus, number>> = {
  PLACED: 0,
  DEALER_ASSIGNED: 0,
  ACCEPTED: 1,
  PACKING: 1,
  PACKED: 1,
  RIDER_ASSIGNED: 2,
  PICKED_UP: 2,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3,
};

/** Headline per stage. */
const TITLE: Record<number, TKey> = { 0: "gt_placed", 1: "gt_packing", 2: "gt_rider", 3: "gt_delivered" };

export function GroceryTracker({ status, window }: { status: OrderStatus; window?: string | null }) {
  const { c } = useTheme();
  const t = useT();
  const idx = STOP_OF[status] ?? 0;
  const onTheWay = status === "OUT_FOR_DELIVERY";

  // A light tap when the stage moves on; the line itself is static (rural phones, no jank).
  const last = useRef(idx);
  useEffect(() => {
    if (idx === last.current) return;
    last.current = idx;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [idx]);
  // Line fill: the segments up to the current stop (plus half a segment while the rider is riding).
  const fill = idx === 0 ? "0%" : idx === 1 ? "33.3%" : idx === 2 ? (onTheWay ? "83.3%" : "66.7%") : "100%";

  return (
    <View style={{ borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 18, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <AppText variant="title" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{t(onTheWay ? "gt_onway" : TITLE[idx])}</AppText>
        {window ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AppText variant="caption" muted numberOfLines={1}>{t(idx === 3 ? "gt_deliveredSub" : "gt_arrives")}</AppText>
            {idx < 3 ? <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>{window}</AppText> : null}
          </View>
        ) : null}
      </View>

      <View style={{ height: 44, justifyContent: "center" }}>
        {/* the line, grey under green */}
        <View style={{ position: "absolute", left: 22, right: 22, height: 6, borderRadius: 3, backgroundColor: c.surface2 }} />
        <View style={{ position: "absolute", left: 22, right: 22, height: 6, borderRadius: 3, overflow: "hidden" }}>
          <View style={{ height: 6, width: fill, borderRadius: 3, backgroundColor: c.primary }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {STOPS.map((s, i) => {
            const done = i <= idx;
            return (
              <View key={s.key} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: done ? c.primary : c.surface, borderWidth: done ? 0 : 2, borderColor: c.border, alignItems: "center", justifyContent: "center", elevation: done ? 2 : 0, shadowColor: "#000", shadowOpacity: done ? 0.12 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}>
                <Icon name={s.icon} color={done ? "#FFFFFF" : c.muted} size={s.icon === "scooter" ? 26 : 20} />
              </View>
            );
          })}
        </View>
      </View>

      <AppText variant="caption" muted numberOfLines={2}>{t(onTheWay ? "gt_onway_body" : (`${TITLE[idx]}_body` as TKey))}</AppText>
    </View>
  );
}
