import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";
import { useT, type TKey } from "@/i18n";
import { useTheme } from "@/theme";

/** The four stages a customer cares about before the rider is on the map. */
type Stage = "placed" | "accepted" | "packed" | "pickup";

const STAGE_OF: Partial<Record<OrderStatus, Stage>> = {
  PLACED: "placed",
  DEALER_ASSIGNED: "placed",
  ACCEPTED: "accepted",
  PACKING: "accepted",
  PACKED: "packed",
  RIDER_ASSIGNED: "pickup",
};

const STAGES: { key: Stage; icon: IconName; title: TKey; body: TKey }[] = [
  { key: "placed", icon: "orders", title: "stg_placed", body: "stg_placed_body" },
  { key: "accepted", icon: "logo", title: "stg_accepted", body: "stg_accepted_body" },
  { key: "packed", icon: "cart", title: "stg_packed", body: "stg_packed_body" },
  { key: "pickup", icon: "truck", title: "stg_pickup", body: "stg_pickup_body" },
];

type Props = {
  status: OrderStatus;
  /** True right after checkout: play the "order placed" burst first. */
  justPlaced?: boolean;
};

/**
 * Live progress hero for a fresh order.
 *  1. Right after checkout: a green tick bursts in with "Order placed!".
 *  2. Then it settles into the current stage: a pulsing icon, a short line
 *     saying what is happening now, and a 4-dot track that fills as the
 *     shop (via realtime) accepts, packs and hands over to the rider.
 */
export function OrderProgress({ status, justPlaced }: Props) {
  const { c } = useTheme();
  const t = useT();
  const stage = STAGE_OF[status] ?? "placed";
  const idx = STAGES.findIndex((s) => s.key === stage);

  const [burst, setBurst] = useState(!!justPlaced);
  const pop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(justPlaced ? 0 : 1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const track = useRef(new Animated.Value(idx)).current;
  const lastIdx = useRef(idx);

  // Burst: tick pops in, holds, then the live card fades in underneath.
  useEffect(() => {
    if (!justPlaced) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(pop, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setBurst(false);
      Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, []);

  // Soft heartbeat on the stage icon so the screen never looks frozen.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Stage advanced (realtime): slide the track forward and buzz once.
  useEffect(() => {
    if (idx === lastIdx.current) return;
    lastIdx.current = idx;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(track, { toValue: idx, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [idx]);

  const cur = STAGES[idx];
  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={{ minHeight: 168 }}>
      {burst ? (
        <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" color="#FFFFFF" size={44} strokeWidth={3} />
          </View>
          <AppText variant="title" color={c.successText} numberOfLines={1} style={{ fontSize: 22 }}>{t("orderPlaced")}</AppText>
        </Animated.View>
      ) : null}

      <Animated.View style={{ opacity: fade, padding: 18, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 60, height: 60, alignItems: "center", justifyContent: "center" }}>
            <Animated.View pointerEvents="none" style={{ position: "absolute", width: 60, height: 60, borderRadius: 30, backgroundColor: c.primary, opacity: ringOpacity, transform: [{ scale: ring }] }} />
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name={cur.icon} color={c.primary} size={26} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1} style={{ fontSize: 18, lineHeight: 24 }}>{t(cur.title)}</AppText>
            <AppText variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>{t(cur.body)}</AppText>
          </View>
        </View>

        {/* 4-segment track: filled up to the current stage, the current one shimmers */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          {STAGES.map((s, i) => {
            const fill = track.interpolate({ inputRange: [i - 1, i], outputRange: [0, 1], extrapolate: "clamp" });
            return (
              <View key={s.key} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surface2, overflow: "hidden" }}>
                {/* scaleX from the left edge (native driver can't animate width) */}
                <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: i < idx ? c.success : c.primary, transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-200, 0] }) }], opacity: i === idx ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) : 1 }} />
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row" }}>
          {STAGES.map((s, i) => (
            <AppText key={s.key} variant="caption" color={i <= idx ? c.ink : c.muted} numberOfLines={1} style={{ flex: 1, fontSize: 10, textAlign: i === 0 ? "left" : i === STAGES.length - 1 ? "right" : "center" }}>
              {t(`${s.title}_short` as TKey)}
            </AppText>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
