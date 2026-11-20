import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { BRAND } from "@/lib/brand";
import { Icon } from "./Icon";
import { AppText } from "./AppText";
import { fonts } from "@/theme";

const IN_MS = 520;
const HOLD_MS = 650;
const OUT_MS = 380;

/**
 * Full-screen brand splash on a cold start: the mark and name fade and
 * settle in over the brand red, the tagline follows, then the whole thing
 * fades away to reveal the app. Calls onDone when it has gone.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const logo = useRef(new Animated.Value(0)).current; // 0 → 1: fade + scale in
  const tag = useRef(new Animated.Value(0)).current; // tagline rise
  const out = useRef(new Animated.Value(1)).current; // whole overlay opacity

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logo, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(tag, { toValue: 1, duration: IN_MS + 200, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(out, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: out, zIndex: 1000, elevation: 1000 }]}>
      <StatusBar style="light" />
      <LinearGradient colors={[BRAND.red, BRAND.redDeep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {/* soft rings behind the mark */}
        <View pointerEvents="none" style={{ position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(255,255,255,0.06)" }} />
        <View pointerEvents="none" style={{ position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(255,255,255,0.07)" }} />

        <Animated.View style={{ alignItems: "center", gap: 18, opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }}>
          <View style={{ width: 96, height: 96, borderRadius: 30, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <Icon name="logo" color={BRAND.red} size={52} strokeWidth={2.4} />
          </View>
          <AppText style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 44, letterSpacing: -0.5 }} color="#FFFFFF">{BRAND.name}</AppText>
        </Animated.View>

        <Animated.View style={{ marginTop: 10, alignItems: "center", opacity: tag, transform: [{ translateY: tag.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
          <AppText variant="label" color="rgba(255,255,255,0.9)" style={{ fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" }}>{BRAND.tagline}</AppText>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}
