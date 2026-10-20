import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

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
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  async function verify(value = code) {
    if (value.length !== OTP_LENGTH || !phone) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: value, type: "sms" });
    setLoading(false);
    if (err) {
      setError(t("invalidOtp"));
      setCode("");
      inputRef.current?.focus();
    }
    // On success, onAuthStateChange updates the session and the root layout swaps to (tabs).
  }

  async function resend() {
    if (!phone) return;
    setSeconds(RESEND_SECONDS);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    if (err) setError(err.message);
  }

  // Opened without a phone number (deep link / restored route) → back to login.
  if (!phone) return <Redirect href="/login" />;

  const pretty = `${phone.slice(0, 3)} ${phone.slice(3, 8)} ${phone.slice(8)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 24 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("changeNumber")}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>

        <View style={{ gap: 8 }}>
          <AppText variant="display" numberOfLines={1} style={{ height: 40 }}>{t("otpTitle")}</AppText>
          <AppText muted numberOfLines={2} style={{ height: 44 }}>{t("otpSubtitle", { phone: pretty })}</AppText>
        </View>

        {/* 6 boxes backed by one hidden input (works with SMS autofill). */}
        <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel={t("otpTitle")}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const filled = i < code.length;
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 58,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: error ? c.danger : active ? c.primary : filled ? c.ink : c.border,
                    backgroundColor: c.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppText style={{ fontFamily: fonts.bodyExtra, fontSize: 24, lineHeight: 30 }}>{code[i] ?? ""}</AppText>
                </View>
              );
            })}
          </View>
          <TextInput
            ref={inputRef}
            value={code}
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

        <AppText variant="caption" color={c.danger} numberOfLines={1} style={{ height: 18 }}>{error ?? ""}</AppText>

        <View style={{ flexDirection: "row", justifyContent: "center", height: 18 }}>
          {seconds > 0 ? (
            <AppText variant="caption" muted>{t("resendIn", { s: seconds })}</AppText>
          ) : (
            <Pressable onPress={resend} accessibilityRole="button">
              <AppText variant="label" color={c.price}>{t("resend")}</AppText>
            </Pressable>
          )}
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ paddingBottom: 12 }}>
          <Button label={t("verify")} onPress={() => verify()} loading={loading} disabled={code.length !== OTP_LENGTH} />
        </View>
      </View>
    </SafeAreaView>
  );
}
