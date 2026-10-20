import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { supabase } from "@/lib/supabase";
import { toE164India } from "@/store/auth";
import { useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

/** Step 1 of login: enter mobile number → Supabase sends SMS OTP. */
export default function LoginScreen() {
  const { c, productGradient } = useTheme();
  const t = useT();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const e164 = toE164India(phone);

  async function sendOtp() {
    if (!e164) {
      setError(t("invalidPhone"));
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push({ pathname: "/otp", params: { phone: e164 } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 24 }}>
          {/* Header: logo + language */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                <Icon name="logo" color="#FFFFFF" size={22} />
              </View>
              <AppText variant="title" style={{ fontSize: 22 }}>FreshCut</AppText>
            </View>
            <LangToggle />
          </View>

          {/* Hero */}
          <LinearGradient
            colors={productGradient}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ borderRadius: 28, padding: 24, height: 200, justifyContent: "flex-end" }}
          >
            <AppText variant="display" color="#FFFFFF" numberOfLines={2} style={{ height: 80 }}>{t("loginTitle")}</AppText>
          </LinearGradient>

          {/* Phone input */}
          <View style={{ gap: 10 }}>
            <AppText variant="subtitle" numberOfLines={2} style={{ height: 48 }}>{t("loginSubtitle")}</AppText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 58,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: error ? c.danger : c.border,
                backgroundColor: c.surface,
                paddingHorizontal: 18,
                gap: 10,
              }}
            >
              <AppText variant="bodyBold" style={{ fontSize: 16 }}>+91</AppText>
              <View style={{ width: 1, height: 22, backgroundColor: c.border }} />
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v.replace(/[^\d]/g, "").slice(0, 10));
                  setError(null);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="98765 43210"
                placeholderTextColor={c.muted}
                accessibilityLabel={t("mobileNumber")}
                maxLength={10}
                style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 18, color: c.ink, letterSpacing: 1 }}
                onSubmitEditing={sendOtp}
                returnKeyType="send"
              />
            </View>
            <AppText variant="caption" color={c.danger} numberOfLines={1} style={{ height: 18 }}>{error ?? ""}</AppText>
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ gap: 12, paddingBottom: 12 }}>
            <Button label={t("sendOtp")} onPress={sendOtp} loading={loading} disabled={!e164} />
            <Pressable accessibilityRole="text">
              <AppText variant="caption" muted numberOfLines={2} style={{ textAlign: "center", height: 36 }}>{t("terms")}</AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
