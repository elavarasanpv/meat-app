import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n";
import { Txt } from "@/ui";

const HERO = ["#2A1410", "#7A1E0E", "#E4461F"] as const;

/**
 * Full-screen hello right after sign-in: the role's icon pops in, the shop or
 * rider name, then it fades away onto the home tabs. Shown once per login,
 * and it stays up until the profile has loaded (the API can take a while to
 * wake), so the tabs underneath never show empty.
 */
export function Welcome({ role, name, ready, onDone }: { role: "dealer" | "rider"; name: string | null | undefined; ready: boolean; onDone: () => void }) {
  const t = useT();
  const pop = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(1)).current;

  const [shown, setShown] = useState(false); // the intro has played
  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1400),
    ]).start(({ finished }) => finished && setShown(true));
  }, []);
  // fade out once both the intro has played and the home underneath has its data
  useEffect(() => {
    if (!shown || !ready) return;
    Animated.timing(sheet, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => finished && onDone());
  }, [shown, ready]);

  const first = name?.trim().split(" ")[0];
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: sheet }}>
      <LinearGradient colors={[...HERO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <View pointerEvents="none" style={{ position: "absolute", right: -80, top: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.07)" }} />
        <View pointerEvents="none" style={{ position: "absolute", left: -60, bottom: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.06)" }} />
        <Animated.View style={{ width: 112, height: 112, borderRadius: 36, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", transform: [{ scale: pop }] }}>
          <Icon name={role === "rider" ? "scooter" : "shop"} color="#E4461F" size={role === "rider" ? 68 : 54} strokeWidth={2.2} />
        </Animated.View>
        <Animated.View style={{ alignItems: "center", marginTop: 26, gap: 6, opacity: name === undefined ? 0 : text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <Txt bold size={15} color="rgba(255,255,255,0.75)">{t("welcomeBack")}</Txt>
          <Txt bold size={30} color="#FFFFFF" numberOfLines={2} style={{ textAlign: "center", lineHeight: 38 }}>{role === "rider" ? first ?? t("riderApp") : name ?? t("appName")}</Txt>
          <Txt size={15} color="rgba(255,255,255,0.8)" style={{ textAlign: "center", marginTop: 6 }}>{t(role === "rider" ? "welcomeRider" : "welcomeShop")}</Txt>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}
