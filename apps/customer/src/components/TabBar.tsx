import { useEffect, useRef } from "react";
import { Animated, Easing, LayoutAnimation, Pressable, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon, type TabIconName } from "./TabIcon";
import { useLang } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const ICONS: Record<string, TabIconName> = { index: "home", orders: "orders", cart: "cart", help: "help" };

/**
 * Bottom tab bar in the soft-pill style: idle tabs are just outline icons,
 * and the selected one is a tinted pill holding the solid icon and its label.
 * Switching tabs animates the pill's width (LayoutAnimation) while the
 * tint, icon and label fade and slide in.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const prev = useRef(state.index);
  useEffect(() => {
    if (prev.current !== state.index) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY));
    prev.current = state.index;
  }, [state.index]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 2, paddingHorizontal: 12, gap: 4 }}>
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
  const ta = lang === "ta";
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current; // 0 idle → 1 selected
  const press = useRef(new Animated.Value(1)).current; // squash on touch
  useEffect(() => {
    Animated.timing(t, { toValue: focused ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focused]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.9, speed: 40, bounciness: 0, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }).start()}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={{ flex: focused ? 2.1 : 1, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }}
    >
      {/* soft tint pill behind the selected tab */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24, backgroundColor: c.tint, opacity: t, transform: [{ scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }} />
      <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, transform: [{ scale: press }] }}>
        <TabIcon name={name} focused={focused} color={focused ? c.primary : c.muted} knock={c.tint} pill={false} size={name === "help" ? 28 : 24} />
        {focused ? (
          <Animated.Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{ fontFamily: ta ? fonts.tamilBold : fonts.bodyBold, fontSize: ta ? 12 : 13.5, lineHeight: 18, color: c.price, includeFontPadding: false, opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}
          >
            {label}
          </Animated.Text>
        ) : null}
      </Animated.View>
      {badge != null ? (
        <View style={{ position: "absolute", top: 4, right: focused ? 6 : "18%", minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, borderWidth: 2, borderColor: focused ? c.tint : c.surface, alignItems: "center", justifyContent: "center" }}>
          <Animated.Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: "#FFFFFF" }}>{String(badge)}</Animated.Text>
        </View>
      ) : null}
    </Pressable>
  );
}
