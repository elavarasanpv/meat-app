import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnection } from "@/lib/network";
import { useT } from "@/i18n";
import { Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/**
 * Slides in under the status bar when the phone is offline or our server
 * can't be reached, so a quiet screen is never mistaken for "no orders".
 * Red for no internet, amber for server trouble (internet is fine).
 */
export function OfflineBanner() {
  const c = useC();
  const t = useT();
  const insets = useSafeAreaInsets();
  const state = useConnection();
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(shown, { toValue: state ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [state, shown]);

  if (!state) return null;
  const danger = state === "offline";
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + 6,
        left: 16,
        right: 16,
        zIndex: 50,
        opacity: shown,
        transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: danger ? c.danger : c.warning, elevation: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <Icon name={danger ? "x" : "clock"} color="#FFFFFF" size={18} strokeWidth={2.6} />
        <View style={{ flex: 1 }}>
          <Txt bold size={14} color="#FFFFFF">{t(danger ? "offlineTitle" : "serverTitle")}</Txt>
          <Txt size={12} color="rgba(255,255,255,0.9)">{t(danger ? "offlineBody" : "serverBody")}</Txt>
        </View>
      </View>
    </Animated.View>
  );
}
