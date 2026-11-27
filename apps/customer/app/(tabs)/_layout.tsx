import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { useT } from "@/i18n";
import { useCart } from "@/store/cart";
import { useVertical } from "@/store/vertical";
import { Accent, useTheme } from "@/theme";

export default function TabsLayout() {
  const { c } = useTheme();
  const t = useT();
  const cartCount = useCart((s) => s.items.length);
  const vertical = useVertical((s) => s.vertical);

  return (
    <Tabs
      // the bar takes the section's colour: ember for meat, green for grocery
      tabBar={(props) => <Accent value={vertical}><TabBar {...props} /></Accent>}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.ground },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tabHome") }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t("tabOrders") }}
      />
      <Tabs.Screen
        name="cart"
        options={{ title: t("tabCart"), tabBarBadge: cartCount > 0 ? cartCount : undefined }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t("tabHelp") }}
      />
    </Tabs>
  );
}
