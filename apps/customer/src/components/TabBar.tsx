import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon, type TabIconName } from "./TabIcon";
import { useLang } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const ICONS: Record<string, TabIconName> = { index: "home", orders: "orders", cart: "cart", help: "help" };

/**
 * Bottom tab bar where the selected tab's icon lifts out of the bar: a solid
 * brand-orange disc springs up so it overflows the top edge, the icon turns
 * white, and the label below cross-fades from regular to bold.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 8, overflow: "visible" }}>
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
    // a spring so the disc pops up with a little overshoot, then settles
    Animated.spring(t, { toValue: focused ? 1 : 0, speed: 14, bounciness: focused ? 9 : 0, useNativeDriver: true }).start();
  }, [focused]);

  const ta = lang === "ta";
  const labelStyle = { fontSize: ta ? 11 : 12, lineHeight: 16, includeFontPadding: false as const };
  const DISC = 44;

  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={{ flex: 1, alignItems: "center", overflow: "visible" }}>
      <View style={{ height: 58, minWidth: 72, alignItems: "center", justifyContent: "flex-end", overflow: "visible" }}>
        {/* the disc peeks ~10px above the bar's top edge when selected */}
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.primary,
            // a halo in the page colour so the disc reads as cut out of the bar
            borderWidth: 3,
            borderColor: c.ground,
            elevation: 3,
            shadowColor: "#7A1E0E",
            shadowOpacity: 0.18,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 2 },
            opacity: t,
            transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [6, -14] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        >
          <TabIcon name={name} focused color="#FFFFFF" knock={c.primary} pill={false} size={name === "help" ? 26 : 22} />
        </Animated.View>
        {/* the idle icon fades out as the disc takes over */}
        <Animated.View style={{ position: "absolute", top: 8, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }] }}>
          <TabIcon name={name} focused={false} color={c.muted} pill={false} size={name === "help" ? 30 : 25} />
        </Animated.View>
        {/* regular and bold labels stacked; cross-fade so the weight change is animated */}
        <View style={{ height: 16, marginBottom: 2, alignItems: "center", justifyContent: "center" }}>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[labelStyle, { fontFamily: ta ? fonts.tamil : fonts.body, color: c.muted, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
            {label}
          </Animated.Text>
          <Animated.Text numberOfLines={1} allowFontScaling={false} style={[labelStyle, { position: "absolute", fontFamily: ta ? fonts.tamilBold : fonts.bodyBold, color: c.primary, opacity: t }]}>
            {label}
          </Animated.Text>
        </View>
        {badge != null ? (
          <Animated.View style={{ position: "absolute", top: 2, right: 8, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, borderWidth: 2, borderColor: c.surface, alignItems: "center", justifyContent: "center", transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }, { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>
            <Animated.Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 12, color: "#FFFFFF" }}>{String(badge)}</Animated.Text>
          </Animated.View>
        ) : null}
      </View>
    </Pressable>
  );
}
