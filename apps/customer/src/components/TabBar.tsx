import { useEffect, useRef } from "react";
import { Animated, Easing, LayoutAnimation, Pressable, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon, type TabIconName } from "./TabIcon";
import { useLang } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const ICONS: Record<string, TabIconName> = { index: "home", orders: "orders", cart: "cart", help: "help" };

/**
 * Floating pill tab bar: big simple icons, and the selected tab is a solid
 * brand-orange pill that widens to show its label. Switching tabs animates
 * the widths (LayoutAnimation) while the pill, icon and label fade/scale in.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // animate the width change of the active pill on every tab switch
  const prev = useRef(state.index);
  useEffect(() => {
    if (prev.current !== state.index) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY));
    prev.current = state.index;
  }, [state.index]);

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) + 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: 66,
          padding: 7,
          borderRadius: 33,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          shadowColor: "#3A1D15",
          shadowOpacity: 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
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
    Animated.timing(t, { toValue: focused ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focused]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.88, speed: 40, bounciness: 0, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }).start()}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={{ flex: focused ? 2 : 1, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" }}
    >
      {/* the solid pill behind the selected tab */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 26, backgroundColor: c.primary, opacity: t, transform: [{ scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }} />
      <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, transform: [{ scale: press }] }}>
        <TabIcon name={name} focused={focused} color={focused ? "#FFFFFF" : c.muted} knock={c.primary} pill={false} size={name === "help" ? 30 : 26} />
        {focused ? (
          <Animated.Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{ fontFamily: ta ? fonts.tamilBold : fonts.bodyBold, fontSize: ta ? 12 : 14, lineHeight: 18, color: "#FFFFFF", includeFontPadding: false, opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}
          >
            {label}
          </Animated.Text>
        ) : null}
      </Animated.View>
      {badge != null ? (
        <View style={{ position: "absolute", top: 6, right: focused ? 10 : "22%", minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: focused ? "#FFFFFF" : c.primary, borderWidth: 2, borderColor: focused ? c.primary : c.surface, alignItems: "center", justifyContent: "center" }}>
          <Animated.Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: focused ? c.primary : "#FFFFFF" }}>{String(badge)}</Animated.Text>
        </View>
      ) : null}
    </Pressable>
  );
}
