import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { JOURNEY_ART, JOURNEY_MARKER, type JourneyStop } from "@/lib/journeyArt";
import { useT, type TKey } from "@/i18n";
import { useTheme } from "@/theme";

const STOPS: JourneyStop[] = ["placed", "shop", "cutting", "packed", "rider"];

/** Which stop each order status lands on. */
const STOP_OF: Partial<Record<OrderStatus, number>> = {
  PLACED: 0,
  DEALER_ASSIGNED: 0,
  ACCEPTED: 1,
  PACKING: 2,
  PACKED: 3,
  RIDER_ASSIGNED: 4,
  PICKED_UP: 4,
};

const PAD = 28; // road inset from the card edge
const STOP = 52; // stop artwork size
const MARK = 30; // marker size

type Props = { status: OrderStatus };

/**
 * Horizontal order journey: a road with five stops (placed → shop → cutting
 * → packed → rider). The marker slides to the current stop and the road
 * behind it turns green; the current stop's artwork animates (bob, or a
 * two-frame chop/ride when PNG frames are provided). All vector/tiny PNG,
 * nothing fetched — works the same on 2G.
 */
export function OrderJourney({ status }: Props) {
  const { c } = useTheme();
  const t = useT();
  const idx = STOP_OF[status] ?? 0;
  const [width, setWidth] = useState(0);
  const span = Math.max(0, width - PAD * 2);
  const xOf = (i: number) => PAD + (span * i) / (STOPS.length - 1);

  // --- marker + road progress (0..4), animated on every stage change
  const pos = useRef(new Animated.Value(idx)).current;
  const last = useRef(idx);
  useEffect(() => {
    if (idx === last.current) return;
    last.current = idx;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(pos, { toValue: idx, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [idx]);

  // --- idle animation on the current stop: gentle bob + frame flip
  const bob = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const f = Animated.loop(Animated.sequence([
      Animated.timing(flip, { toValue: 1, duration: 320, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(flip, { toValue: 0, duration: 320, easing: Easing.linear, useNativeDriver: true }),
    ]));
    a.start();
    f.start();
    return () => { a.stop(); f.stop(); };
  }, []);

  const cur = STOPS[idx];
  const markerX = pos.interpolate({ inputRange: [0, STOPS.length - 1], outputRange: [xOf(0) - MARK / 2, xOf(STOPS.length - 1) - MARK / 2] });
  // Green road: a full-width bar scaled from its left edge (native driver can't animate width).
  const roadScale = pos.interpolate({ inputRange: [0, STOPS.length - 1], outputRange: [0.0001, 1] });

  return (
    <View style={{ minHeight: 200 }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingTop: 18, paddingBottom: 16, gap: 10 }}>
        {/* Road */}
        <View style={{ height: STOP + 34 }}>
          {width > 0 ? (
            <>
              <View style={{ position: "absolute", left: PAD, right: PAD, top: STOP + 6, height: 6, borderRadius: 3, backgroundColor: c.surface2 }} />
              <Animated.View style={{ position: "absolute", left: PAD, width: span, top: STOP + 6, height: 6, borderRadius: 3, backgroundColor: c.success, transform: [{ translateX: -span / 2 }, { scaleX: roadScale }, { translateX: span / 2 }] }} />

              {STOPS.map((s, i) => {
                const done = i < idx || i === 0;
                const on = i === idx;
                const next = i === idx + 1 || (idx === 0 && i === 1);
                const live = on && !done ? true : next; // artwork that animates
                const art = JOURNEY_ART[s];
                const x = xOf(i);
                return (
                  <View key={s} style={{ position: "absolute", left: x - STOP / 2, top: 0, width: STOP, alignItems: "center" }}>
                    {/* artwork above the road; current one bobs / flips frames */}
                    <Animated.View style={{ width: STOP, height: STOP, alignItems: "center", justifyContent: "center", opacity: done || on || next ? 1 : 0.45, transform: live ? [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }, { scale: 1.1 }] : [] }}>
                      {art.frames?.length ? (
                        <>
                          <Animated.Image source={art.frames[0]} style={{ position: "absolute", width: STOP, height: STOP, opacity: live && art.frames[1] ? flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }) : 1 }} resizeMode="contain" />
                          {live && art.frames[1] ? <Animated.Image source={art.frames[1]} style={{ position: "absolute", width: STOP, height: STOP, opacity: flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }) }} resizeMode="contain" /> : null}
                        </>
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: done ? c.successBg : on || next ? c.tint : c.surface2, alignItems: "center", justifyContent: "center" }}>
                          <Icon name={art.icon} color={done ? c.success : on || next ? c.primary : c.muted} size={22} />
                        </View>
                      )}
                    </Animated.View>
                    {/* stop dot on the road */}
                    <View style={{ marginTop: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: done ? c.success : c.surface, borderWidth: 2.5, borderColor: done ? c.success : on || next ? c.primary : c.border, alignItems: "center", justifyContent: "center" }}>
                      {done ? <Icon name="check" color="#FFFFFF" size={8} strokeWidth={3.5} /> : null}
                    </View>
                    <AppText variant="caption" color={done ? c.ink : on || next ? c.price : c.muted} numberOfLines={1} style={{ fontSize: 10, marginTop: 4, width: 64, textAlign: "center" }}>
                      {t(`jr_${s}` as TKey)}
                    </AppText>
                  </View>
                );
              })}

              {/* travelling marker, rides on the road */}
              <Animated.View pointerEvents="none" style={{ position: "absolute", top: STOP + 9 - MARK / 2, width: MARK, height: MARK, transform: [{ translateX: markerX }] }}>
                {JOURNEY_MARKER ? (
                  <Image source={JOURNEY_MARKER} style={{ width: MARK, height: MARK }} resizeMode="contain" />
                ) : (
                  <View style={{ width: MARK, height: MARK, borderRadius: MARK / 2, backgroundColor: c.primary, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }}>
                    <Icon name="home" color="#FFFFFF" size={14} strokeWidth={2.6} />
                  </View>
                )}
              </Animated.View>
            </>
          ) : null}
        </View>

        {/* What is happening now */}
        <View style={{ paddingHorizontal: 18, marginTop: 8 }}>
          <AppText variant="title" numberOfLines={1} style={{ fontSize: 18, lineHeight: 24 }}>{t(`jr_${cur}_title` as TKey)}</AppText>
          <AppText variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>{t(`jr_${cur}_body` as TKey)}</AppText>
        </View>
      </View>
    </View>
  );
}
