import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const PATTERN = require("@freshcut/assets/images/pattern-doodles.png");
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/** Step 2 of login: verify the 6-digit SMS code. On success the root layout switches to the app. */
export default function OtpScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        <Image source={PATTERN} resizeMode="contain" style={{ width: "100%", height: "100%", opacity: 0.14 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("changeNumber")}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>

        {/* SMS badge */}
        <View style={{ alignItems: "center", marginTop: 26 }}>
          <View style={{ width: 86, height: 86, borderRadius: 30, backgroundColor: done ? c.successBg : c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name={done ? "check" : "chat"} color={done ? c.success : c.primary} size={38} strokeWidth={done ? 3 : 2} />
            {!done && (
              <View style={{ position: "absolute", right: -2, top: -2, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: c.ground }}>
                <AppText variant="label" color="#FFFFFF" style={{ fontSize: 12 }}>1</AppText>
              </View>
            )}
          </View>
        </View>

        <View style={{ alignItems: "center", marginTop: 18, gap: 6 }}>
          <AppText variant="display" numberOfLines={2} style={{ textAlign: "center", fontSize: 28, lineHeight: 34 }}>{done ? t("otpVerifying") : t("otpTitle")}</AppText>
          {!done && (
            <AppText muted numberOfLines={2} style={{ textAlign: "center" }}>
              {t("otpSubtitle", { phone: "" }).replace(/\s+$/, "")} <AppText variant="bodyBold">{pretty}</AppText>
            </AppText>
          )}
          {!done && (
            <Pressable onPress={() => router.back()} hitSlop={6} accessibilityRole="button">
              <AppText variant="label" color={c.price}>{t("otpWrongNumber")} {t("changeNumber")}</AppText>
            </Pressable>
          )}
        </View>

        {/* 6 boxes backed by one hidden input (works with SMS autofill). */}
        <Animated.View style={{ marginTop: 30, transform: [{ translateX: shake }] }}>
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
                      height: 62,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: error ? c.danger : done ? c.success : active ? c.primary : filled ? c.ink : c.border,
                      backgroundColor: done ? c.successBg : filled ? c.tintSoft : c.surface,
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

        <AppText variant="caption" color={error ? c.danger : c.muted} numberOfLines={2} style={{ minHeight: 18, marginTop: 12, textAlign: "center" }}>
          {error ?? (done ? "" : t("otpHint"))}
        </AppText>

        {!done && (
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 16, height: 36 }}>
            {seconds > 0 ? (
              <>
                <Icon name="clock" color={c.muted} size={14} />
                <AppText variant="caption" muted>{t("resendIn", { s: seconds })}</AppText>
              </>
            ) : (
              <Pressable onPress={resend} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: pressed ? c.tint : c.tintSoft })}>
                <AppText variant="label" color={c.price}>{t("resend")}</AppText>
              </Pressable>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />
        <View style={{ paddingBottom: 12 }}>
          <Button label={done ? t("otpVerifying") : t("verify")} onPress={() => verify()} loading={loading} disabled={code.length !== OTP_LENGTH} />
        </View>
      </View>
    </SafeAreaView>
  );
}
