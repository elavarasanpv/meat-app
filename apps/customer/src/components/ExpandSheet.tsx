import { useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useExpand } from "@/store/expand";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** How long the sheet takes to fill the screen; the tab swaps midway, then the sheet fades. */
export const EXPAND_MS = 380;

/**
 * Sits at the app root, above everything including the tab bar. When the
 * cart bar is tapped it grows from the bar's frame into a full-screen sheet
 * in the page colour, the Cart tab opens underneath, and it fades away.
 */
export function ExpandSheet() {
  const { c } = useTheme();
  const t = useT();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const rect = useExpand((s) => s.rect);
  const key = useExpand((s) => s.key);
  const end = useExpand((s) => s.end);
  const grow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!rect) return;
    grow.setValue(0);
    fade.setValue(1);
    Animated.sequence([
      Animated.timing(grow, { toValue: 1, duration: EXPAND_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(60),
      Animated.timing(fade, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start(({ finished }) => finished && end());
  }, [key]);

  if (!rect) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: grow.interpolate({ inputRange: [0, 1], outputRange: [rect.x, 0] }),
        top: grow.interpolate({ inputRange: [0, 1], outputRange: [rect.y, 0] }),
        width: grow.interpolate({ inputRange: [0, 1], outputRange: [rect.w, screenW] }),
        height: grow.interpolate({ inputRange: [0, 1], outputRange: [rect.h, screenH] }),
        borderRadius: grow.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }),
        backgroundColor: c.ground,
        opacity: fade,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        elevation: 30,
        zIndex: 1000,
      }}
    >
      {/* the label rides along and fades as the sheet opens */}
      <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: grow.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.5, 0] }), transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }}>
        <Icon name="cart" color={c.primary} size={22} />
        <AppText variant="title" color={c.price}>{t("viewCart")}</AppText>
      </Animated.View>
    </Animated.View>
  );
}
