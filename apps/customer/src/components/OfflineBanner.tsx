import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useIsOffline } from "@/lib/network";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Thin strip under the status bar while there is no internet. Slides in/out. */
export function OfflineBanner() {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: offline ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  }, [offline]);

  const height = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });

  return (
    <Animated.View style={{ height, overflow: "hidden", backgroundColor: c.ink, zIndex: 50 }}>
      <View style={{ height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 }}>
        <Icon name="bell" color="#FFFFFF" size={14} />
        <AppText variant="label" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 12 }}>{t("offlineBanner")}</AppText>
      </View>
      {/* keep the strip below the status bar on the first screen */}
      <View style={{ height: insets.top > 0 ? 0 : 0 }} />
    </Animated.View>
  );
}
