import { useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { ScaleCamera } from "@/components/ScaleCamera";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useDealerMe, useDealerRealtime, useSummary } from "@/hooks/useDealer";
import { usePush } from "@/hooks/usePush";
import { playOrderAlert } from "@/lib/sounds";
import { useC } from "@/ui";

export default function TabsLayout() {
  const c = useC();
  const me = useDealerMe();
  const summary = useSummary(me.data?.id);
  useDealerRealtime(me.data?.id);
  usePush("dealer");
  const newCount = summary.data?.newCount ?? 0;
  // A new order arrived while the app is open: our own chop-and-chime.
  const prevNew = useRef<number | null>(null);
  useEffect(() => {
    if (prevNew.current !== null && newCount > prevNew.current) playOrderAlert();
    prevNew.current = newCount;
  }, [newCount]);
  return (
    <>
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.ground } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" options={{ tabBarBadge: newCount > 0 ? newCount : undefined }} />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="stock" />
      <Tabs.Screen name="account" />
    </Tabs>
    <OfflineBanner />
    <ScaleCamera />
    </>
  );
}
