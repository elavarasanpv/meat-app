import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useLang, useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

/** Phone + OTP login, same flow as the customer app. */
export function Login() {
  const c = useC();
  const t = useT();
  const toggle = useLang((s) => s.toggle);
  const lang = useLang((s) => s.lang);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = {
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    letterSpacing: 2,
    color: c.ink,
  } as const;

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
      if (e) throw e;
      setStage("otp");
    } catch {
      setError(t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: "sms" });
      if (e) throw e;
    } catch {
      setError(t("loginFailed"));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, padding: 24, gap: 14, justifyContent: "center" }}>
        <Pressable onPress={toggle} accessibilityRole="button" style={{ position: "absolute", top: 18, right: 24, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
          <Txt bold size={13}>{lang === "ta" ? "English" : "தமிழ்"}</Txt>
        </Pressable>

        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <Txt bold size={30} color="#FFFFFF">F</Txt>
        </View>
        <Txt bold size={26}>{t("loginTitle")}</Txt>
        <Txt muted>{t("loginSub")}</Txt>

        {stage === "phone" ? (
          <>
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
              keyboardType="number-pad"
              placeholder="9999999999"
              placeholderTextColor={c.muted}
              style={field}
              accessibilityLabel={t("phone")}
            />
            <Btn label={t("sendOtp")} big onPress={sendOtp} loading={busy} disabled={phone.length !== 10} />
          </>
        ) : (
          <>
            <TextInput
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={c.muted}
              style={field}
              autoFocus
              accessibilityLabel={t("otp")}
            />
            <Btn label={t("verify")} big onPress={verify} loading={busy} disabled={otp.length !== 6} />
          </>
        )}
        <Txt size={13} color={c.danger} numberOfLines={2} style={{ height: 38 }}>{error ?? ""}</Txt>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
