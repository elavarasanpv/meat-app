import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfferSheet } from "@/components/OfferSheet";
import { useRiderMe, useRiderRealtime, useTasks } from "@/hooks/useRider";
import { useRiderGps } from "@/hooks/useRiderGps";
import { useC } from "@/ui";

/** Rider mode: Home · Tasks · History · Cash · Profile, plus the offer popup and GPS. */
export default function RiderLayout() {
  const c = useC();
  const me = useRiderMe();
  const tasks = useTasks(me.data?.id);
  useRiderRealtime(me.data?.id);
  useRiderGps(me.data?.isOnline);
  const active = tasks.data?.orders.length ?? 0;
  return (
    <>
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.ground } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="tasks" options={{ tabBarBadge: active > 0 ? active : undefined }} />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="cash" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <OfflineBanner />
      <OfferSheet />
    </>
  );
}
