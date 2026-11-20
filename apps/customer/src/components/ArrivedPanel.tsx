import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Linking, Pressable, View } from "react-native";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const rider = require("@freshcut/assets/images/rider-arrived.png");
const chime = require("../../assets/sounds/arrived.wav");

/** How far the panel slides up over the map above it. */
export const ARRIVED_OVERLAP = 28;

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
export function ArrivedPanel({ amount, paymentMode, otp, riderPhone }: Props) {
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
        marginTop: -ARRIVED_OVERLAP,
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
      <View style={{ backgroundColor: c.primary, height: 140, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: -40, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.12)" }} />
        <View style={{ position: "absolute", left: 60, bottom: -90, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(0,0,0,0.08)" }} />
        <Image source={rider} resizeMode="contain" style={{ position: "absolute", right: 0, bottom: -8, width: 100, height: 148 }} />

        <View style={{ padding: 18, paddingRight: 112, gap: 6, flex: 1, justifyContent: "center" }}>
          <Animated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", transform: [{ scale: pulse }] }}>
            <Icon name="bell" color="#FFFFFF" size={20} />
          </Animated.View>
          <AppText style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 27 }} color="#FFFFFF" numberOfLines={2}>
            {t("riderArrived")}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={2}>
            {t("arrivedSub")}
          </AppText>
        </View>
      </View>

      {/* What to do now: OTP and amount side by side, then Call */}
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 18, backgroundColor: c.tint, borderWidth: 1, borderColor: c.primary, alignItems: "center", gap: 4 }}>
            <AppText variant="label" color={c.price} numberOfLines={1} style={{ fontSize: 12 }}>{t("yourOtp")}</AppText>
            <AppText style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: 4 }} color={c.ink} numberOfLines={1} adjustsFontSizeToFit>{otp ?? "— — — —"}</AppText>
            <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 11.5 }}>{t("tellRider")}</AppText>
          </View>
          <View style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 18, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: 4 }}>
            <AppText variant="label" muted numberOfLines={1} style={{ fontSize: 12 }}>{t("amountDue")}</AppText>
            <AppText style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }} color={paymentMode === "prepaid_upi" ? c.successText : c.price} numberOfLines={1} adjustsFontSizeToFit>
              {paymentMode === "prepaid_upi" ? "✓" : `₹${amount}`}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 11.5 }}>{payLabel}</AppText>
          </View>
        </View>

        <Pressable
          onPress={() => riderPhone && Linking.openURL(`tel:${riderPhone}`)}
          disabled={!riderPhone}
          accessibilityRole="button"
          accessibilityLabel={t("callRider")}
          style={({ pressed }) => ({ height: 50, borderRadius: 25, backgroundColor: pressed ? c.primaryPressed : c.success, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 })}
        >
          <Icon name="phone" color="#FFFFFF" size={20} />
          <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 15 }}>{t("callRider")}</AppText>
        </Pressable>
      </View>
    </Animated.View>
  );
}
