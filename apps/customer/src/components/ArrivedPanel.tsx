import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Linking, Pressable, View } from "react-native";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const rider = require("../../assets/images/rider-arrived.png");
const chime = require("../../assets/sounds/arrived.wav");

type Props = {
  amount: number;
  paymentMode: "cod" | "upi_on_delivery" | "prepaid_upi";
  otp: string | null;
  riderPhone?: string;
};

/**
 * Shown the moment the rider taps "Arrived": slides up from below with a
 * bounce, plays a doorbell chime + haptic once, and makes the two things the
 * customer needs obvious — the OTP to read out and the amount to pay.
 */
export function ArrivedPanel({ amount, paymentMode, otp, riderPhone = "+919999999999" }: Props) {
  const { c } = useTheme();
  const t = useT();
  const player = useAudioPlayer(chime);
  const slide = useRef(new Animated.Value(1)).current; // 1 = off-screen (below), 0 = in place
  const pulse = useRef(new Animated.Value(1)).current;
  const played = useRef(false);

  useEffect(() => {
    Animated.spring(slide, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }).start();
    // bell wiggle on the icon, loops gently
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
    if (!played.current) {
      played.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        player.seekTo(0);
        player.play();
      } catch {
        // sound is best-effort (muted devices, web)
      }
    }
  }, []);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 260] });
  const payLabel = paymentMode === "cod" ? t("payCod") : paymentMode === "upi_on_delivery" ? t("payUpi") : t("paidOnline");

  return (
    <Animated.View
      style={{
        marginTop: -56,
        marginHorizontal: 16,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: c.surface,
        elevation: 10,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        transform: [{ translateY }],
      }}
    >
      {/* Hero band: ember gradient feel via two layers + the rider illustration */}
      <View style={{ backgroundColor: c.primary, height: 190, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: -40, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.12)" }} />
        <View style={{ position: "absolute", left: 60, bottom: -90, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(0,0,0,0.08)" }} />
        <Image source={rider} resizeMode="contain" style={{ position: "absolute", right: -6, bottom: -8, width: 132, height: 200 }} />

        <View style={{ padding: 18, paddingRight: 140, gap: 8, flex: 1, justifyContent: "center" }}>
          <Animated.View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", transform: [{ scale: pulse }] }}>
            <Icon name="bell" color="#FFFFFF" size={24} />
          </Animated.View>
          <AppText style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }} color="#FFFFFF" numberOfLines={2}>
            {t("riderArrived")}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={2}>
            {t("arrivedSub")}
          </AppText>
        </View>
      </View>

      {/* What to do now: OTP + amount */}
      <View style={{ padding: 16, gap: 12 }}>
        {otp ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, backgroundColor: c.tint, borderWidth: 1.5, borderColor: c.primary }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={c.price} numberOfLines={1}>{t("yourOtp")}</AppText>
              <AppText variant="caption" muted numberOfLines={2}>{t("shareOtp")}</AppText>
            </View>
            <View style={{ paddingHorizontal: 14, height: 56, borderRadius: 16, backgroundColor: c.surface, justifyContent: "center" }}>
              <AppText style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: 6 }} color={c.ink}>{otp}</AppText>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, backgroundColor: c.surface2 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" muted numberOfLines={1}>{t("amountDue")}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{payLabel}</AppText>
          </View>
          <AppText style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 36 }} color={paymentMode === "prepaid_upi" ? c.successText : c.price}>
            {paymentMode === "prepaid_upi" ? "✓" : `₹ ${amount}`}
          </AppText>
        </View>

        <Pressable
          onPress={() => Linking.openURL(`tel:${riderPhone}`)}
          accessibilityRole="button"
          accessibilityLabel={t("callRider")}
          style={({ pressed }) => ({ height: 52, borderRadius: 26, backgroundColor: pressed ? c.primaryPressed : c.success, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 })}
        >
          <Icon name="phone" color="#FFFFFF" size={20} />
          <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 15 }}>{t("callRider")}</AppText>
        </Pressable>
      </View>
    </Animated.View>
  );
}
