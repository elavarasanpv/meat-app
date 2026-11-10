import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearFreshLogin, markFreshLogin } from "@/lib/freshLogin";
import { supabase } from "@/lib/supabase";
import { useLang, useT } from "@/i18n";
import { Icon } from "@/components/Icon";
import { Btn, Txt, useC } from "@/ui";

/** Ember gradient for the hero; the dark end matches the partner app icon. */
const HERO = ["#2A1410", "#7A1E0E", "#E4461F"] as const;

/**
 * Phone + OTP login for shop owners and riders. The hero says who the app is
 * for (one app, two jobs); the card below takes the number, then the code.
 */
export function Login() {
  const c = useC();
  const t = useT();
  const insets = useSafeAreaInsets();
  const toggle = useLang((s) => s.toggle);
  const lang = useLang((s) => s.lang);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const otpRef = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;

  // the hero shrinks for the keyboard so the field and button stay on screen
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
    Animated.sequence([8, -8, 5, -5, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, easing: Easing.linear, useNativeDriver: true }))).start();
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
      if (e) throw e;
      setStage("otp");
      setTimeout(() => otpRef.current?.focus(), 150);
    } catch {
      setError(t("loginFailed"));
      wobble();
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    markFreshLogin(); // the role gate shows the welcome screen once
    try {
      const { error: e } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: "sms" });
      if (e) throw e;
    } catch {
      clearFreshLogin();
      setError(t("loginFailed"));
      wobble();
      setBusy(false);
    }
  }

  const pretty = phone.length > 5 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
  const field = { flex: 1, height: 56, fontFamily: "Manrope_700Bold", fontSize: 20, letterSpacing: 1.5, color: c.ink } as const;
  const box = { flexDirection: "row", alignItems: "center", height: 60, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, borderColor: error ? c.danger : c.border, backgroundColor: c.surface, gap: 10 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      {/* hero */}
      <LinearGradient colors={[...HERO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 10, paddingHorizontal: 22, paddingBottom: keyboard ? 22 : 30, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden" }}>
        <View pointerEvents="none" style={{ position: "absolute", right: -70, top: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <View pointerEvents="none" style={{ position: "absolute", left: -40, bottom: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.06)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              <Icon name="shop" color={c.primary} size={22} strokeWidth={2.4} />
            </View>
            <Txt bold size={19} color="#FFFFFF">FreshCut Partner</Txt>
          </View>
          <Pressable onPress={toggle} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}>
            <Txt bold size={13} color="#FFFFFF">{lang === "ta" ? "English" : "தமிழ்"}</Txt>
          </Pressable>
        </View>

        {!keyboard ? (
          <View style={{ marginTop: 26, gap: 16 }}>
            <Txt bold size={lang === "ta" ? 26 : 30} color="#FFFFFF" style={{ lineHeight: lang === "ta" ? 36 : 38 }}>{t("loginHero")}</Txt>
            {/* who this app is for */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {([["shop", "forShops", "forShopsSub"], ["scooter", "forRiders", "forRidersSub"]] as const).map(([icon, title, sub]) => (
                <View key={icon} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={icon} color="#FFFFFF" size={icon === "scooter" ? 28 : 21} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt bold size={14} color="#FFFFFF" numberOfLines={1}>{t(title)}</Txt>
                    <Txt size={11.5} color="rgba(255,255,255,0.72)" numberOfLines={2} style={{ lineHeight: 15 }}>{t(sub)}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 16 + insets.bottom }}>
          <Txt bold size={13} color={c.primary}>{t(stage === "phone" ? "signIn" : "otp")}</Txt>
          <Txt bold size={24} style={{ marginTop: 4, lineHeight: 31 }}>{stage === "phone" ? t("loginSubAll") : t("otpSentTo").replace("{phone}", `+91 ${pretty}`)}</Txt>

          <Animated.View style={{ marginTop: 22, gap: 12, transform: [{ translateX: shake }] }}>
            {stage === "phone" ? (
              <View style={box}>
                <Txt bold size={17} color={c.muted}>🇮🇳 +91</Txt>
                <View style={{ width: 1, height: 26, backgroundColor: c.border }} />
                <TextInput
                  value={phone}
                  onChangeText={(v) => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setError(null); }}
                  keyboardType="number-pad"
                  placeholder="98765 43210"
                  placeholderTextColor={c.muted}
                  style={field}
                  accessibilityLabel={t("phone")}
                  returnKeyType="done"
                  onSubmitEditing={() => phone.length === 10 && sendOtp()}
                />
                {phone.length === 10 ? (
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.successBg, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" color={c.success} size={15} strokeWidth={3} />
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={box}>
                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={(v) => { setOtp(v.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                  keyboardType="number-pad"
                  placeholder="••••••"
                  placeholderTextColor={c.muted}
                  style={[field, { letterSpacing: 10, textAlign: "center" }]}
                  autoFocus
                  accessibilityLabel={t("otp")}
                  onSubmitEditing={() => otp.length === 6 && verify()}
                />
              </View>
            )}
            {error ? <Txt size={13} color={c.danger} numberOfLines={2}>{error}</Txt> : null}
          </Animated.View>

          <View style={{ flex: 1 }} />
          <View style={{ gap: 12, marginTop: 20 }}>
            {stage === "phone" ? (
              <Btn label={t("sendOtp")} big onPress={sendOtp} loading={busy} disabled={phone.length !== 10} />
            ) : (
              <>
                <Btn label={t("verify")} big onPress={verify} loading={busy} disabled={otp.length !== 6} />
                <Pressable onPress={() => { setStage("phone"); setOtp(""); setError(null); }} accessibilityRole="button" style={{ alignSelf: "center", paddingVertical: 6 }}>
                  <Txt bold size={14} color={c.primary}>{t("changeNumber")}</Txt>
                </Pressable>
              </>
            )}
            <Txt size={12} muted style={{ textAlign: "center" }}>{t("loginFoot")}</Txt>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
