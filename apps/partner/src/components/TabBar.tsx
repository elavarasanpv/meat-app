import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { useT, type TKey } from "@/i18n";
import { Txt, useC } from "@/ui";

const TABS: Record<string, { icon: IconName; label: TKey }> = {
  index: { icon: "home", label: "tabHome" },
  orders: { icon: "inbox", label: "tabOrders" },
  history: { icon: "history", label: "tabHistory" },
  stock: { icon: "stock", label: "tabStock" },
  account: { icon: "shop", label: "tabAccount" },
  // rider mode
  tasks: { icon: "rider", label: "tabTasks" },
  cash: { icon: "wallet", label: "tabCash" },
  profile: { icon: "user", label: "tabProfile" },
};

/** Same pill tab bar as the customer app: tinted pill around icon + label, icon fills when selected. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useC();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 4 }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const { options } = descriptors[route.key];
        const meta = TABS[route.name] ?? TABS.index;
        const badge = options.tabBarBadge;
        const onPress = () => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return <Tab key={route.key} icon={meta.icon} label={meta.label} focused={focused} onPress={onPress} badge={badge} />;
      })}
    </View>
  );
}

function Tab({ icon, label, focused, onPress, badge }: { icon: IconName; label: TKey; focused: boolean; onPress: () => void; badge?: string | number }) {
  const c = useC();
  const t = useT();
  const a = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: focused ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focused]);
  const color = focused ? c.primary : c.muted;
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} style={{ flex: 1, alignItems: "center" }}>
      <View style={{ height: 58, width: "100%", alignItems: "center", justifyContent: "center" }}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: 4, right: 4, top: 0, bottom: 0, borderRadius: 18, backgroundColor: c.tint, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }} />
        <Animated.View style={{ transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
          <Icon name={icon} color={color} size={24} filled={focused} />
        </Animated.View>
        <Txt bold={focused} size={11} color={color} numberOfLines={1} style={{ marginTop: 2 }}>{t(label)}</Txt>
        {badge != null ? (
          <View style={{ position: "absolute", top: 4, right: "22%", minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, borderWidth: 2, borderColor: c.surface, alignItems: "center", justifyContent: "center" }}>
            <Txt bold size={10} color="#FFFFFF">{String(badge)}</Txt>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
