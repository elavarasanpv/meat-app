import { Tabs } from "expo-router";
import { View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useLang, useT } from "@/i18n";
import { useCart } from "@/store/cart";
import { fonts, useTheme } from "@/theme";

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 52,
        height: 32,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? c.tint : "transparent",
      }}
    >
      <Icon name={name} color={color} size={22} strokeWidth={focused ? 2.4 : 2.1} />
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const cartCount = useCart((s) => s.items.length);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 84, paddingTop: 8, paddingBottom: 14 },
        tabBarLabelStyle: { fontFamily: lang === "ta" ? fonts.tamilBold : fonts.bodyBold, fontSize: lang === "ta" ? 11 : 12, lineHeight: 16 },
        tabBarAllowFontScaling: false,
        sceneStyle: { backgroundColor: c.ground },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tabHome"), tabBarIcon: (p) => <TabIcon name="home" {...p} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t("tabOrders"), tabBarIcon: (p) => <TabIcon name="orders" {...p} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t("tabCart"),
          tabBarIcon: (p) => <TabIcon name="cart" {...p} />,
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.primary, color: "#FFFFFF", fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t("tabHelp"), tabBarIcon: (p) => <TabIcon name="phone" {...p} /> }}
      />
    </Tabs>
  );
}
