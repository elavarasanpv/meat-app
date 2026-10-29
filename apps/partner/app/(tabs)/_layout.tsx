import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { useDealerMe, useDealerRealtime, useSummary } from "@/hooks/useDealer";
import { useC } from "@/ui";

export default function TabsLayout() {
  const c = useC();
  const me = useDealerMe();
  const summary = useSummary(me.data?.id);
  useDealerRealtime(me.data?.id);
  const newCount = summary.data?.newCount ?? 0;
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.ground } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" options={{ tabBarBadge: newCount > 0 ? newCount : undefined }} />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="stock" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
