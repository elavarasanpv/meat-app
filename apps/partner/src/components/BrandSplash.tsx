import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { BRAND } from "@/lib/brand";
import { LOGO_BODY, LOGO_LINES, LOGO_T, LOGO_VIEWBOX } from "./Logo";
import { fonts } from "@/theme";

const DASH_MS = 200;
const ARRIVE_MS = 300;
const LETTER_MS = 320;
const STAGGER_MS = 38;
const HOLD_MS = 600;
const OUT_MS = 320;
const SIZE = 112;
/** How far the mark sits below its resting place at the start, so it begins where the system splash drew it. */
const LIFT = 46;
const LETTERS = BRAND.name.split("");
/** Right-hand tip of each speed line as a fraction of the mark's box; the line stretches back from here. */
const LINE_TIPS = [[0.342, 0.498], [0.311, 0.608], [0.278, 0.71]];
const STREAK = 2.6;

/**
 * Opening screen on a cold start. The mark starts where the system splash
 * left it, dashes off to the right and races back in from the left with its
 * speed lines streaking behind, brakes into place, and the name writes itself
 * in letter by letter under it; the lines keep flickering while it waits,
 * then it all fades to reveal the app. Calls onDone when it has gone.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current; // mark's sideways travel, px
  const y = useRef(new Animated.Value(LIFT)).current;
  const lean = useRef(new Animated.Value(0)).current; // degrees, forward is positive
  const streaks = useRef(LINE_TIPS.map(() => new Animated.Value(1))).current; // each line's length
  const letters = useRef(LETTERS.map(() => new Animated.Value(0))).current; // each letter: fade + rise
  const tag = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current; // whole overlay opacity

  useEffect(() => {
    const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });
    const spring = (v: Animated.Value, toValue: number) => Animated.spring(v, { toValue, friction: 5, tension: 120, useNativeDriver: true });
    const flicker = Animated.loop(
      Animated.stagger(110, streaks.map((v) => Animated.sequence([t(v, 1.28, 260, Easing.inOut(Easing.quad)), t(v, 1, 260, Easing.inOut(Easing.quad))]))),
    );
    Animated.sequence([
      Animated.delay(140),
      // wind up, then dash off to the right
      Animated.parallel([t(x, -18, 140), t(lean, -5, 140)]),
      Animated.parallel([t(x, width * 0.8, DASH_MS, Easing.in(Easing.cubic)), t(lean, 10, DASH_MS), ...streaks.map((v) => t(v, STREAK, DASH_MS))]),
      // come back in from the left, at the resting height
      Animated.parallel([t(x, -width * 0.8, 0), t(y, 0, 0)]),
      t(x, 16, ARRIVE_MS),
      // brake: settle, straighten up, pull the streaks in one after another; the name starts writing
      Animated.parallel([
        spring(x, 0),
        Animated.sequence([t(lean, -3, 120), spring(lean, 0)]),
        Animated.stagger(50, streaks.map((v) => t(v, 1, 160))),
        Animated.stagger(STAGGER_MS, letters.map((v) => t(v, 1, LETTER_MS, Easing.out(Easing.back(1.6))))),
      ]),
      t(tag, 1, 360),
    ]).start(({ finished }) => {
      if (!finished) return;
      flicker.start();
      Animated.sequence([Animated.delay(HOLD_MS), t(out, 0, OUT_MS, Easing.in(Easing.quad))]).start((r) => r.finished && onDone());
    });
    return () => flicker.stop();
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: out, zIndex: 1000, elevation: 1000 }]}>
      <StatusBar style="light" />
      <LinearGradient colors={[BRAND.red, BRAND.red, BRAND.redDeep]} locations={[0, 0.5, 1]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={{
            width: SIZE, height: SIZE,
            transform: [{ translateX: x }, { translateY: y }, { rotate: lean.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) }],
          }}
        >
          {LOGO_LINES.map((d, i) => (
            <Animated.View
              key={i}
              style={[
                StyleSheet.absoluteFill,
                // stretch along the line's own slant, anchored at its tip
                { transformOrigin: [LINE_TIPS[i][0] * SIZE, LINE_TIPS[i][1] * SIZE, 0], transform: [{ rotate: "-6.4deg" }, { scaleX: streaks[i] }, { rotate: "6.4deg" }] },
              ]}
            >
              <Svg width={SIZE} height={SIZE} viewBox={LOGO_VIEWBOX}>
                <Path d={d} fill="#FFFFFF" />
              </Svg>
            </Animated.View>
          ))}
          <Svg width={SIZE} height={SIZE} viewBox={LOGO_VIEWBOX} style={StyleSheet.absoluteFill}>
            <Path d={LOGO_BODY} fill="#FFFFFF" fillRule="evenodd" />
            <Path d={LOGO_T} fill={BRAND.red} />
          </Svg>
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
