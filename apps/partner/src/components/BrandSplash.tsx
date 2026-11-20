import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { BRAND } from "@/lib/brand";
import { fonts } from "@/theme";

const IN_MS = 520;
const HOLD_MS = 650;
const OUT_MS = 380;

/**
 * Full-screen brand splash on a cold start: mark and name settle in over the
 * brand red, the tagline follows, then it fades away. Calls onDone after.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const logo = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

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
        <View pointerEvents="none" style={{ position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(255,255,255,0.06)" }} />
        <View pointerEvents="none" style={{ position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(255,255,255,0.07)" }} />
        <Animated.View style={{ alignItems: "center", gap: 18, opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }}>
          <View style={{ width: 96, height: 96, borderRadius: 30, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 52, lineHeight: 60, color: BRAND.red }}>T</Text>
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 36, lineHeight: 42, color: "#FFFFFF", letterSpacing: -0.5 }}>{BRAND.name}</Text>
        </Animated.View>
        <Animated.View style={{ marginTop: 10, alignItems: "center", opacity: tag, transform: [{ translateY: tag.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.9)" }}>Partner · {BRAND.tagline}</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}
