import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { supabase } from "@/lib/supabase";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const PATTERN = require("@freshcut/assets/images/pattern-doodles.png");
/** Shop → rider → your door, in the same line style as the login drawing. */
const JOURNEY = require("@freshcut/assets/images/otp-journey.png");
const HEADER = ["#FFF1E8", "#FFE0CC", "#FBC9A6"] as const;
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/** Step 2 of login: verify the 6-digit SMS code. On success the root layout switches to the app. */
export default function OtpScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;


  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  // caret blink in the active box
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(blink, { toValue: 0, duration: 500, easing: Easing.linear, useNativeDriver: true }), Animated.timing(blink, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [blink]);

  function wobble() {
    shake.setValue(0);
    Animated.sequence([10, -10, 6, -6, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true }))).start();
  }

  async function verify(value = code) {
    if (value.length !== OTP_LENGTH || !phone || loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: value, type: "sms" });
    if (err) {
      setLoading(false);
      setError(t("invalidOtp"));
      setCode("");
      wobble();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      inputRef.current?.focus();
      return;
    }
    // Success: show the tick while onAuthStateChange swaps the root layout to (tabs).
    setDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  async function resend() {
    if (!phone) return;
    setSeconds(RESEND_SECONDS);
    setError(null);
    setCode("");
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    if (err) setError(err.message);
    else Haptics.selectionAsync().catch(() => {});
  }

  // Opened without a phone number (deep link / restored route) → back to login.
  if (!phone) return <Redirect href="/login" />;

  const pretty = `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      {/* hero: same peach gradient and doodles as login, with the shop-to-door drawing */}
      <LinearGradient colors={[...HEADER]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden" }}>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="cover" style={{ width: "100%", height: "100%", opacity: 0.18 }} />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", right: -60, top: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.35)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("changeNumber")}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="back" color={c.ink} size={20} />
          </Pressable>
          <LangToggle />
        </View>
                  <View style={{ alignItems: "center", marginTop: 10 }}>
            <Image source={JOURNEY} resizeMode="contain" style={{ width: "100%", height: 150 }} />
            {done ? (
              <View style={{ position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" color="#FFFFFF" size={18} strokeWidth={3} />
              </View>
            ) : null}
          </View>
      </LinearGradient>

      <SafeAreaView edges={["bottom"]} style={{ flex: 1, paddingHorizontal: 22, paddingTop: 20 }}>
        <AppText variant="label" color={c.price} numberOfLines={1}>{done ? t("otpVerifying") : t("otpKicker")}</AppText>
        <AppText variant="display" numberOfLines={2} style={{ marginTop: 4 }}>{done ? t("otpVerifying") : t("otpTitle")}</AppText>
        {!done && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
            <AppText muted numberOfLines={2}>
              {t("otpSubtitle", { phone: "" }).replace(/\s+$/, "")} <AppText variant="bodyBold">{pretty}</AppText>
            </AppText>
            <Pressable onPress={() => router.back()} hitSlop={6} accessibilityRole="button">
              <AppText variant="label" color={c.price}>{t("changeNumber")}</AppText>
            </Pressable>
          </View>
        )}

        {/* 6 boxes backed by one hidden input (works with SMS autofill). */}
        <Animated.View style={{ marginTop: 22, transform: [{ translateX: shake }] }}>
          <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel={t("otpTitle")}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                const filled = i < code.length;
                const active = i === code.length && !done;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 60,
                      borderRadius: 16,
                      borderWidth: active ? 2 : 1.5,
                      borderColor: error ? c.danger : done ? c.success : active ? c.primary : filled ? c.primary : c.border,
                      backgroundColor: done ? c.successBg : filled ? c.tint : c.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {filled ? (
                      <AppText style={{ fontFamily: fonts.bodyExtra, fontSize: 26, lineHeight: 32, color: done ? c.successText : c.ink }}>{code[i]}</AppText>
                    ) : active ? (
                      <Animated.View style={{ width: 2, height: 26, borderRadius: 1, backgroundColor: c.primary, opacity: blink }} />
                    ) : null}
                  </View>
                );
              })}
            </View>
            <TextInput
              ref={inputRef}
              value={code}
              editable={!done}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, OTP_LENGTH);
                setCode(digits);
                setError(null);
                if (digits.length === OTP_LENGTH) verify(digits);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={OTP_LENGTH}
              caretHidden
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            />
          </Pressable>
        </Animated.View>

        {/* one tidy line: the hint or the error, and the resend state on the right */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, minHeight: 36 }}>
          <AppText variant="caption" color={error ? c.danger : c.muted} numberOfLines={2} style={{ flex: 1 }}>
            {error ?? (done ? "" : t("otpHint"))}
          </AppText>
          {!done && (seconds > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Icon name="clock" color={c.muted} size={13} />
              <AppText variant="caption" muted numberOfLines={1}>{t("resendIn", { s: seconds })}</AppText>
            </View>
          ) : (
            <Pressable onPress={resend} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: pressed ? c.tint : c.tintSoft })}>
              <AppText variant="label" color={c.price} numberOfLines={1}>{t("resend")}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ paddingBottom: 12 }}>
          <Button label={done ? t("otpVerifying") : t("verify")} onPress={() => verify()} loading={loading} disabled={code.length !== OTP_LENGTH} />
        </View>
      </SafeAreaView>
    </View>
  );
}
