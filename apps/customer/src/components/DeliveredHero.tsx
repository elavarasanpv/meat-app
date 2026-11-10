import { Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const RIDER = require("@freshcut/assets/images/delivered-rider-3d.png");

type History = { to_status: string; created_at: string }[];

const at = (h: History, s: string) => {
  const r = h.find((x) => x.to_status === s);
  return r ? Date.parse(r.created_at) : null;
};
/** 1 → "1 min", 42 → "42 mins", 75 → "1 hr 15 mins". */
function span(ms: number, t: ReturnType<typeof useT>) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return t(m === 1 ? "spanMin" : "spanMins", { n: m });
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? t("spanHrMins", { h, n: r }) : t("spanHr", { h });
}

/**
 * Full-width header for a delivered order: brand ember gradient with a warm glow
 * behind the 3D rider, how long the ride took, and a white card of two small
 * facts (packed in, on time) that sits half over the bottom edge.
 */
export function DeliveredHero({ displayId, placedAt, history, slotEnd, onBack }: { displayId: string; placedAt: string; history: History; slotEnd: string | null; onBack: () => void }) {
  const t = useT();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const accepted = at(history, "ACCEPTED");
  const packed = at(history, "PACKED");
  const pickedUp = at(history, "PICKED_UP") ?? at(history, "OUT_FOR_DELIVERY");
  const delivered = at(history, "DELIVERED");
  const ride = pickedUp && delivered && delivered > pickedUp ? delivered - pickedUp : null;
  // scheduled orders are often accepted hours early and packed near the slot; only show a real packing time
  const packing = accepted && packed && packed > accepted && packed - accepted < 2 * 3_600_000 ? packed - accepted : null;
  const onTime = delivered && slotEnd ? delivered <= Date.parse(slotEnd) : null;
  const placed = new Date(placedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();

  const facts = packing != null || onTime != null;
  const chip = (icon: "clock" | "check", tone: string, label: string, value: string) => (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)" }}>
      <Icon name={icon} color={tone} size={15} strokeWidth={2.8} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={1} style={{ fontSize: 11 }}>{label}</AppText>
        <AppText variant="bodyBold" color={tone} numberOfLines={1} style={{ fontSize: 13 }}>{value}</AppText>
      </View>
    </View>
  );

  return (
    <View style={{ backgroundColor: c.ground }}>
      <LinearGradient colors={["#F0522A", "#E4461F", "#B8361A"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ paddingTop: insets.top + 6, paddingBottom: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" }}>
        {/* soft rays + a warm glow so the orange rider stands off the orange ground */}
        <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 400 420" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", left: 0, top: 0 }}>
          <Defs>
            <RadialGradient id="glow" cx="200" cy="185" r="190" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFE9D2" stopOpacity={0.75} />
              <Stop offset="0.55" stopColor="#FFC49A" stopOpacity={0.28} />
              <Stop offset="1" stopColor="#FFC49A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d="M200 190 L-20 60 L-20 130 Z" fill="#FFFFFF" opacity={0.07} />
          <Path d="M200 190 L-20 240 L-20 300 Z" fill="#FFFFFF" opacity={0.05} />
          <Path d="M200 190 L420 50 L420 120 Z" fill="#FFFFFF" opacity={0.07} />
          <Path d="M200 190 L420 230 L420 290 Z" fill="#FFFFFF" opacity={0.05} />
          <Path d="M200 190 L130 -10 L270 -10 Z" fill="#FFFFFF" opacity={0.06} />
          <Rect x="0" y="0" width="400" height="420" fill="url(#glow)" />
        </Svg>

        {/* top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
            <Icon name="back" color="#1C1715" size={20} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 15 }}>{displayId}</AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>{t("placedAtTime", { time: placed })}</AppText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* rider, standing on a soft shadow */}
        <View style={{ alignItems: "center", marginTop: 2 }}>
          <Svg pointerEvents="none" width={120} height={14} viewBox="0 0 120 14" style={{ position: "absolute", bottom: -2 }}>
            <Ellipse cx="60" cy="7" rx="56" ry="6" fill="#5A1508" opacity={0.28} />
          </Svg>
          <Image source={RIDER} resizeMode="contain" style={{ width: 150, height: 170 }} />
        </View>

        {/* headline */}
        <View style={{ alignItems: "center", paddingHorizontal: 20, marginTop: 8, gap: 6 }}>
{ride ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }}>
              <Icon name="check" color="#FFFFFF" size={12} strokeWidth={3.2} />
              <AppText variant="label" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 11, letterSpacing: 0.6 }}>{t("st_DELIVERED").toUpperCase()}</AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {ride ? (
              <Svg width={15} height={20} viewBox="0 0 18 24">
                <Path d="M11 0 L0 14 H7 L5 24 L18 9 H10 Z" fill="#FFD23F" />
              </Svg>
            ) : null}
            <AppText color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: 23, lineHeight: 28 }}>
              {ride ? t("deliveredIn", { time: span(ride, t) }) : t("st_DELIVERED")}
            </AppText>
          </View>
        </View>

      {facts ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 12 }}>
          {packing != null ? chip("clock", "#FFFFFF", t("packedIn"), span(packing, t)) : null}
          {onTime != null ? chip(onTime ? "check" : "clock", onTime ? "#8FF0B8" : "#FFD08A", t("yourSlot"), onTime ? t("onTime") : t("aBitLate")) : null}
        </View>
      ) : null}
      </LinearGradient>
    </View>
  );
}
