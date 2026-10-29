import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon, type TabIconName } from "./TabIcon";
import { useLang } from "@/i18n";
import { useCart } from "@/store/cart";
import { fonts, useTheme } from "@/theme";

const ICONS: Record<string, TabIconName> = { index: "home", orders: "orders", cart: "cart", help: "help" };

/**
 * Bottom tab bar where the selected tab is a soft pill wrapped around both
 * the icon and its label: the pill fades/grows in, the icon fills solid and
 * scales up a touch, and the label cross-fades from regular to bold.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 8 }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const { options } = descriptors[route.key];
        const label = typeof options.title === "string" ? options.title : route.name;
        const onPress = () => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return <Tab key={route.key} name={ICONS[route.name] ?? "home"} label={label} focused={focused} onPress={onPress} badge={options.tabBarBadge} />;
      })}
    </View>
  );
}

function Tab({ name, label, focused, onPress, badge }: { name: TabIconName; label: string; focused: boolean; onPress: () => void; badge?: string | number }) {
  const { c } = useTheme();
  const lang = useLang((s) => s.lang);
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: focused ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focused]);

  const color = focused ? c.primary : c.muted;
  const ta = lang === "ta";
  const labelStyle = { fontSize: ta ? 11 : 12, lineHeight: 16, includeFontPadding: false as const };

  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={{ flex: 1, alignItems: "center" }}>
      <View style={{ height: 62, minWidth: 72, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }}>
        {/* pill behind icon + label */}
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 20, backgroundColor: c.tint, opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}
        />
        <Animated.View style={{ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
          <TabIcon name={name} focused={focused} color={color} pill={false} />
        </Animated.View>
        {/* regular and bold labels stacked; cross-fade so the weight change is animated */}
        <View style={{ height: 16, marginTop: 2, alignItems: "center", justifyContent: "center" }}>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[labelStyle, { fontFamily: ta ? fonts.tamil : fonts.body, color: c.muted, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
            {label}
          </Animated.Text>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[labelStyle, { position: "absolute", fontFamily: ta ? fonts.tamilBold : fonts.bodyBold, color: c.primary, opacity: t }]}>
            {label}
          </Animated.Text>
        </View>
        {badge != null ? (
          <View style={{ position: "absolute", top: 2, right: 10, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, borderWidth: 2, borderColor: c.surface, alignItems: "center", justifyContent: "center" }}>
            <Animated.Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: "#FFFFFF" }}>{String(badge)}</Animated.Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
