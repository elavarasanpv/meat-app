import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { ARRIVING_KM, etaMinutesRange, haversineKm } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import type { RiderLocation } from "@/hooks/useTracking";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

type Point = { lat: number; lng: number };

type Props = {
  rider: RiderLocation | null | undefined;
  pickup: Point | null;
  home: Point | null;
};

/** Older than this, we say "last seen X min ago" instead of a live ETA. */
const STALE_MS = 3 * 60_000;
const DOT = 34;

function agoLabel(iso: string, now: number, t: ReturnType<typeof useT>): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return t("updatedSecs", { n: s });
  return t("updatedMins", { n: Math.round(s / 60) });
}

/**
 * Map-free live tracking: Shop ──●── Home with the rider dot sliding along by
 * distance covered, plus distance and an ETA range. Works on any phone, no API key.
 */
export function TrackingCard({ rider, pickup, home }: Props) {
  const { c } = useTheme();
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const [trackW, setTrackW] = useState(0);
  const pos = useRef(new Animated.Value(0)).current;

  // tick every 10 s so "updated 20 s ago" stays honest
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const remainingKm = rider && home ? haversineKm(rider, home) : null;
  const totalKm = pickup && home ? haversineKm(pickup, home) : null;
  const progress =
    remainingKm !== null && totalKm && totalKm > 0 ? Math.min(1, Math.max(0, 1 - remainingKm / totalKm)) : 0;
  const stale = rider ? now - new Date(rider.updated_at).getTime() > STALE_MS : false;
  const arriving = remainingKm !== null && remainingKm <= ARRIVING_KM;

  useEffect(() => {
    Animated.timing(pos, { toValue: progress, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress]);

  const travel = Math.max(0, trackW - DOT);
  const translateX = pos.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });

  let headline: string;
  if (!rider) headline = t("waitingRider");
  else if (arriving) headline = t("arrivingNow");
  else if (remainingKm !== null) {
    const [lo, hi] = etaMinutesRange(remainingKm);
    headline = t("riderAway", { km: remainingKm < 1 ? remainingKm.toFixed(1) : remainingKm.toFixed(1), lo, hi });
  } else headline = t("riderOnTheWay");

  return (
    <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.primary, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stale ? c.muted : c.success }} />
        <AppText variant="label" color={stale ? c.muted : c.successText} numberOfLines={1}>
          {stale ? t("liveLost") : t("liveTracking")}
        </AppText>
      </View>

      <AppText variant="title" numberOfLines={2} style={{ fontSize: 19, lineHeight: 25, height: 50 }}>{headline}</AppText>

      {/* Shop ── rider ── Home */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
            <Icon name="logo" color={c.ink} size={18} />
          </View>
          <View style={{ flex: 1, height: DOT, justifyContent: "center" }} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border }} />
            <View style={{ position: "absolute", left: 0, height: 6, borderRadius: 3, backgroundColor: c.primary, width: `${progress * 100}%` }} />
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: c.primary,
                borderWidth: 3,
                borderColor: c.surface,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ translateX }],
                opacity: rider ? 1 : 0.4,
              }}
            >
              <Icon name="truck" color="#FFFFFF" size={16} />
            </Animated.View>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="home" color={c.primary} size={18} />
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <AppText variant="caption" muted numberOfLines={1}>{t("shop")}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{t("yourHome")}</AppText>
        </View>
      </View>

      {rider ? (
        <AppText variant="caption" muted numberOfLines={1}>{agoLabel(rider.updated_at, now, t)}</AppText>
      ) : null}
    </View>
  );
}
