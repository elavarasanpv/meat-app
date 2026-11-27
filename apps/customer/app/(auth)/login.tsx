import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/LangToggle";
import { openLegal } from "@/lib/legal";
import { supabase } from "@/lib/supabase";
import { toE164India } from "@/store/auth";
import { useSplashDone } from "@/store/splash";
import { useT } from "@/i18n";
import { fonts, radius, useTheme, withAccent } from "@/theme";

const MEAT = require("@thanjozmart/assets/images/section-meat.webp");
const EGGS = require("@thanjozmart/assets/images/farm-eggs.webp");
const LEG = require("@thanjozmart/assets/images/leg-piece.webp");
const BONELESS = require("@thanjozmart/assets/images/chicken-boneless.webp");
const GROCERY = require("@thanjozmart/assets/images/section-grocery.webp");
const PATTERN = require("@thanjozmart/assets/images/pattern-doodles.webp");

/** Step 1 of login: enter mobile number → Supabase sends SMS OTP. */
export default function LoginScreen() {
  const { c, tone, glow } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;

  const e164 = toE164India(phone);
  const pretty = phone.length > 5 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;


  function wobble() {
    shake.setValue(0);
    Animated.sequence([8, -8, 5, -5, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true }))).start();
  }

  async function sendOtp() {
    if (!e164) {
      setError(t("invalidPhone"));
      wobble();
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (err) {
      setError(err.message);
      wobble();
      return;
    }
    router.push({ pathname: "/otp", params: { phone: e164 } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      {/* hero: peach gradient, faint doodles, a winding road with what we deliver along it */}
      <LinearGradient colors={[...tone.header]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden" }}>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="cover" style={{ width: "100%", height: "100%", opacity: 0.18 }} />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", right: -60, top: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: glow(0.35) }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Logo bag="#FFFFFF" mark={c.primary} size={27} />
            </View>
            <AppText variant="title" style={{ fontSize: 22 }}>Thanjoz Mart</AppText>
          </View>
          <LangToggle />
        </View>
        <PathHero />
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={["bottom"]} style={{ flex: 1, paddingHorizontal: 22, paddingTop: 22 }}>
          <AppText variant="label" color={c.price} numberOfLines={1}>{t("loginKicker")}</AppText>
          <AppText variant="display" style={{ marginTop: 4 }}>{t("loginTitle")}</AppText>
          <AppText muted style={{ marginTop: 6 }}>{t("loginSubtitle")}</AppText>

          <AppText variant="label" muted style={{ marginTop: 22, marginBottom: 8 }}>{t("loginPhoneLabel")}</AppText>
          <Animated.View style={{ transform: [{ translateX: shake }] }}>
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 60,
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: error ? c.danger : focused || e164 ? c.primary : c.border,
                backgroundColor: c.surface,
                paddingLeft: 18,
                paddingRight: 8,
                gap: 10,
              }}
            >
              <AppText variant="bodyBold" style={{ fontSize: 17 }}>🇮🇳 +91</AppText>
              <View style={{ width: 1, height: 24, backgroundColor: c.border }} />
              <TextInput
                ref={inputRef}
                value={pretty}
                onChangeText={(v) => {
                  setPhone(v.replace(/[^\d]/g, "").slice(0, 10));
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="98765 43210"
                placeholderTextColor={c.muted}
                accessibilityLabel={t("mobileNumber")}
                maxLength={11}
                style={{ flex: 1, fontFamily: fonts.bodyExtra, fontSize: 19, color: c.ink, letterSpacing: 1.2 }}
                onSubmitEditing={sendOtp}
                returnKeyType="send"
              />
              <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                {e164 ? (
                  /* small solid green dot with a white tick: "this number is good" */
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" color="#FFFFFF" size={12} strokeWidth={3.2} />
                  </View>
                ) : phone ? (
                  <Pressable onPress={() => setPhone("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("close")}>
                    <Icon name="close" color={c.muted} size={16} />
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
          <AppText variant="caption" color={c.danger} numberOfLines={2} style={{ minHeight: 18, marginTop: 8 }}>{error ?? ""}</AppText>

          <View style={{ flex: 1 }} />

          <View style={{ gap: 12, paddingBottom: 12 }}>
            <Button label={loading ? t("otpSending") : t("sendOtp")} onPress={sendOtp} loading={loading} disabled={!e164} />
            <AppText variant="caption" muted numberOfLines={2} style={{ textAlign: "center" }}>{t("terms")}</AppText>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
              <Pressable onPress={() => openLegal("terms")} hitSlop={8} accessibilityRole="link"><AppText variant="label" color={c.price}>{t("termsLink")}</AppText></Pressable>
              <Pressable onPress={() => openLegal("privacy")} hitSlop={8} accessibilityRole="link"><AppText variant="label" color={c.price}>{t("privacyLink")}</AppText></Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const HERO_H = 250;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Where each picture sits on the hero, as a share of its width and height, and how big its circle is. */
const SPOTS = [
  { key: "meat", image: MEAT, x: 0.42, y: 0.5, size: 132, accent: "meat" },
  { key: "grocery", image: GROCERY, x: 0.84, y: 0.7, size: 100, accent: "grocery" },
  { key: "eggs", image: EGGS, x: 0.13, y: 0.17, size: 72, accent: "plain" },
  { key: "leg", image: LEG, x: 0.9, y: 0.13, size: 68, accent: "plain" },
  { key: "boneless", image: BONELESS, x: 0.14, y: 0.83, size: 76, accent: "plain" },
] as const;

/**
 * The login picture: one winding road drawn across the hero, with what we deliver sitting along
 * it. Meat in the middle, the grocery basket further down the road, smaller cuts and eggs around
 * them. The road draws itself, the pictures pop in one by one, then everything floats very gently.
 */
function PathHero() {
  const { c, dark, glow } = useTheme();
  const g = withAccent(c, "grocery", dark);
  const { width: w } = useWindowDimensions();
  const h = HERO_H;
  const draw = useRef(new Animated.Value(0)).current;
  const pops = useRef(SPOTS.map(() => new Animated.Value(0))).current;
  const bob = useRef(new Animated.Value(0)).current;

  // Wait for the opening brand animation to clear, or the entrance would play unseen behind it.
  const seen = useSplashDone((s) => s.done);
  useEffect(() => {
    if (!seen) return;
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const run = Animated.parallel([
      Animated.timing(draw, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.stagger(110, pops.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }))),
    ]);
    run.start(({ finished }) => { if (finished) float.start(); });
    return () => { run.stop(); float.stop(); };
  }, [seen]);

  const ROAD_LEN = w * 2.2;
  const road = `M -10 ${h * 0.56} C ${w * 0.16} ${h * 0.34}, ${w * 0.26} ${h * 0.06}, ${w * 0.5} ${h * 0.06} S ${w * 0.76} ${h * 0.3}, ${w * 0.8} ${h * 0.56} S ${w * 0.9} ${h * 0.96}, ${w + 10} ${h * 1.02}`;

  return (
    <View style={{ height: h, marginHorizontal: -20, marginTop: 10 }}>
      <Svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
        <AnimatedPath d={road} stroke={c.primary} strokeOpacity={0.4} strokeWidth={4} strokeLinecap="round" fill="none" strokeDasharray={ROAD_LEN} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [ROAD_LEN, 0] })} />
      </Svg>
      {/* two beads on the road */}
      <Animated.View style={{ position: "absolute", left: w * 0.62 - 8, top: h * 0.12 - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: c.primary, opacity: draw }} />
      <Animated.View style={{ position: "absolute", left: w * 0.25 - 7, top: h * 0.72 - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: g.primary, opacity: draw }} />
      {SPOTS.map((s, i) => {
        const up = i % 2 ? 1 : -1; // neighbours drift opposite ways, so it never looks like one block moving
        const main = s.size > 90;
        return (
          <Animated.View
            key={s.key}
            style={{
              position: "absolute", left: w * s.x - s.size / 2, top: h * s.y - s.size / 2, width: s.size, height: s.size, alignItems: "center", justifyContent: "center",
              opacity: pops[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: pops[i] }, { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 4 * up] }) }],
            }}
          >
            {/* no plate behind the picture: only a faint pool of light under the two main ones, so they melt into the backdrop */}
            {main ? <View style={{ position: "absolute", width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: glow(0.3) }} /> : null}
            <Image source={s.image} resizeMode="contain" style={{ width: s.size * (main ? 0.86 : 1), height: s.size * (main ? 0.86 : 1) }} />
          </Animated.View>
        );
      })}
    </View>
  );
}
