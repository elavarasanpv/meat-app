import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useT } from "@/i18n";
import { Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/** Within this many minutes of the promised time the pill turns amber. */
export const SOON_MIN = 5;

/** Live state of a promised ready time. */
export function readyState(readyBy: string, now: number): { phase: "ok" | "soon" | "late"; minutes: number } {
  const diffMin = Math.ceil((new Date(readyBy).getTime() - now) / 60_000);
  if (diffMin < 0) return { phase: "late", minutes: -diffMin };
  if (diffMin <= SOON_MIN) return { phase: "soon", minutes: diffMin };
  return { phase: "ok", minutes: diffMin };
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/**
 * The promised ready time as a live pill: "Ready by 4:14 pm · 18 min" (green)
 * → "5 min left" (amber) → "12 min late" (red, pulsing). Buzzes once when it
 * turns amber and once when it turns late, so the owner feels it without
 * looking at the screen.
 */
export function ReadyBy({ readyBy }: { readyBy: string }) {
  const c = useC();
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef<"ok" | "soon" | "late" | null>(null);

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(h);
  }, []);

  const { phase, minutes } = readyState(readyBy, now);

  useEffect(() => {
    if (prev.current !== null && prev.current !== phase && phase !== "ok") {
      Haptics.notificationAsync(phase === "late" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    prev.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== "late") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const bg = phase === "late" ? c.danger : phase === "soon" ? c.warning : c.successBg;
  const fg = phase === "ok" ? c.success : "#FFFFFF";
  // Past an hour, minutes stop meaning anything: "2 h 15 min late".
  const span = (m: number) => (m < 60 ? `${m} ${t("min")}` : `${Math.floor(m / 60)} ${t("hr")} ${m % 60} ${t("min")}`);
  const label =
    phase === "late" ? `${span(minutes)} ${t("lateWord")}` : phase === "soon" ? `${minutes} ${t("minLeft")}` : `${t("readyBy")} ${clock(readyBy)} · ${span(minutes)}`;

  return (
    <Animated.View style={{ opacity: pulse, alignSelf: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: bg }}>
        <Icon name="clock" color={fg} size={16} strokeWidth={2.6} />
        <Txt bold size={13} color={fg}>{label}</Txt>
      </View>
    </Animated.View>
  );
}
