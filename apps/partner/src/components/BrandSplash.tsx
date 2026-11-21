import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { BRAND } from "@/lib/brand";
import { Logo } from "./Logo";
import { fonts } from "@/theme";

const LIFT_MS = 420;
const LETTER_MS = 320;
const STAGGER_MS = 38;
const HOLD_MS = 700;
const OUT_MS = 320;
/** How far the mark sits below its resting place at the start, so it begins where the system splash drew it. */
const LIFT = 46;
const LETTERS = BRAND.name.split("");

/**
 * Opening screen on a cold start. The mark starts where the system splash
 * left it, lifts, and the name writes itself in letter by letter under it;
 * the tagline follows, then it all fades to reveal the app. Calls onDone
 * when it has gone.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const lift = useRef(new Animated.Value(0)).current; // 0 → 1: mark rises to its place
  const letters = useRef(LETTERS.map(() => new Animated.Value(0))).current; // each letter: fade + rise
  const tag = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current; // whole overlay opacity

  useEffect(() => {
    Animated.sequence([
      Animated.delay(140),
      Animated.parallel([
        Animated.timing(lift, { toValue: 1, duration: LIFT_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(160),
          Animated.stagger(STAGGER_MS, letters.map((v) => Animated.timing(v, { toValue: 1, duration: LETTER_MS, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }))),
        ]),
      ]),
      Animated.timing(tag, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(out, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: out, zIndex: 1000, elevation: 1000 }]}>
      <StatusBar style="light" />
      <LinearGradient colors={[BRAND.red, BRAND.red, BRAND.redDeep]} locations={[0, 0.5, 1]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [LIFT, 0] }) }] }}>
          <Logo bag="#FFFFFF" mark={BRAND.red} size={112} />
        </Animated.View>

        <View accessible accessibilityLabel={BRAND.name} style={{ flexDirection: "row", marginTop: 6 }}>
          {LETTERS.map((ch, i) => (
            <Animated.Text
              key={i}
              allowFontScaling={false}
              style={{
                fontFamily: fonts.bodyBold, fontSize: 44, lineHeight: 54, letterSpacing: -0.6, color: "#FFFFFF",
                opacity: letters[i],
                transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              }}
            >
              {ch === " " ? "\u00A0" : ch}
            </Animated.Text>
          ))}
        </View>

        <Animated.Text
          allowFontScaling={false}
          style={{
            marginTop: 2, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.4, color: "rgba(255,255,255,0.92)",
            opacity: tag,
            transform: [{ translateY: tag.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          }}
        >
          Partner · {BRAND.tagline}
        </Animated.Text>
      </LinearGradient>
    </Animated.View>
  );
}
