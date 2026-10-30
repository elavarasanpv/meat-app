import { useEffect, useRef, useState } from "react";
import { playPlaced } from "@/lib/sounds";
import { Animated, Easing, Modal, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Full-screen green flash right after checkout: a big tick springs in with
 * "Order placed successfully!", holds a moment, then the whole sheet fades
 * away to reveal the order screen underneath. Pure animation, no assets.
 */
export function PlacedFlash({ onDone }: { onDone?: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const [show, setShow] = useState(true);
  const sheet = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    playPlaced();
    Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(1400),
      Animated.timing(sheet, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setShow(false);
      onDone?.();
    });
  }, []);

  if (!show) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
    <Animated.View pointerEvents="none" style={{ flex: 1, backgroundColor: c.success, alignItems: "center", justifyContent: "center", opacity: sheet }}>
      {/* expanding ring behind the tick */}
      <Animated.View style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: "rgba(255,255,255,0.7)", opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.6] }) }] }} />
      <Animated.View style={{ alignItems: "center", gap: 18, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }], opacity: pop }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" color={c.success} size={64} strokeWidth={3.2} />
        </View>
        <AppText variant="display" color="#FFFFFF" numberOfLines={2} style={{ fontSize: 26, lineHeight: 32, textAlign: "center", paddingHorizontal: 32 }}>
          {t("orderPlacedSuccess")}
        </AppText>
      </Animated.View>
    </Animated.View>
    </Modal>
  );
}
