import { useEffect, useRef, useState } from "react";
import { Animated, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { openLegal } from "@/lib/legal";
import { supabase } from "@/lib/supabase";
import { toE164India } from "@/store/auth";
import { useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const HERO = require("@freshcut/assets/images/doodle-handoff.png");
const PATTERN = require("@freshcut/assets/images/pattern-doodles.png");
const HEADER = ["#FFF1E8", "#FFE0CC", "#FBC9A6"] as const;

/** Step 1 of login: enter mobile number → Supabase sends SMS OTP. */
export default function LoginScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;

  const e164 = toE164India(phone);
  const pretty = phone.length > 5 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  // the hero makes room for the keyboard instead of pushing the form off screen
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
      {/* hero: peach gradient, faint doodles, the goat hand-off */}
      <LinearGradient colors={[...HEADER]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden" }}>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="cover" style={{ width: "100%", height: "100%", opacity: 0.18 }} />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", right: -60, top: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.35)" }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Icon name="logo" color="#FFFFFF" size={22} />
            </View>
            <AppText variant="title" style={{ fontSize: 22 }}>FreshCut</AppText>
          </View>
          <LangToggle />
        </View>
        {!keyboard && (
          <View style={{ alignItems: "center", marginTop: 10 }}>
            <Image source={HERO} resizeMode="contain" style={{ width: 250, height: 200 }} />
          </View>
        )}
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={["bottom"]} style={{ flex: 1, paddingHorizontal: 22, paddingTop: 22 }}>
          <AppText variant="label" color={c.price} numberOfLines={1}>{t("loginKicker")}</AppText>
          <AppText variant="display" numberOfLines={2} style={{ marginTop: 4 }}>{t("loginTitle")}</AppText>
          <AppText muted numberOfLines={2} style={{ marginTop: 6 }}>{t("loginSubtitle")}</AppText>

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
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: e164 ? c.successBg : "transparent", alignItems: "center", justifyContent: "center" }}>
                {e164 ? <Icon name="check" color={c.success} size={18} strokeWidth={3} /> : phone ? (
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
