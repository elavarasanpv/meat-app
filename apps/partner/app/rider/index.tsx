import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Header } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { StopCard } from "@/components/StopCard";
import { usePullRefreshKeys } from "@/hooks/usePullRefresh";
import { amountDue, useRiderMe, useRiderSummary, useSetOnline, useTasks } from "@/hooks/useRider";
import { navigateTo } from "@/lib/maps";
import { useT, type TKey } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

function greeting(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "goodMorning" : h < 17 ? "goodAfternoon" : "goodEvening";
}

/** Rider Home: online switch, today's numbers, and the next stop. */
export default function RiderHome() {
  const c = useC();
  const t = useT();
  const router = useRouter();
  const refresh = usePullRefreshKeys([["rider"]]);
  const me = useRiderMe();
  const summary = useRiderSummary(me.data?.id);
  const tasks = useTasks(me.data?.id);
  const setOnline = useSetOnline();
  const [online, setOn] = useState(me.data?.isOnline ?? false);
  useEffect(() => {
    if (me.data) setOn(me.data.isOnline);
  }, [me.data?.isOnline]);

  const s = summary.data;
  const orders = tasks.data?.orders ?? [];
  const trip = tasks.data?.trip ?? null;
  // The next stop: lowest open sequence on the trip, else the first order to collect.
  const next =
    orders
      .filter((o) => o.status === "OUT_FOR_DELIVERY")
      .sort((a, b) => (trip?.trip_stops.find((x) => x.order_id === a.id)?.seq ?? 0) - (trip?.trip_stops.find((x) => x.order_id === b.id)?.seq ?? 0))[0] ??
    orders.find((o) => o.status === "RIDER_ASSIGNED");

  const Stat = ({ icon, label, value, color, bg }: { icon: IconName; label: TKey; value: string | number; color: string; bg: string }) => (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={color} size={20} />
      </View>
      <Txt bold size={22} numberOfLines={1}>{value}</Txt>
      <Txt size={12} muted numberOfLines={1}>{t(label)}</Txt>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title={me.data?.name ? `${t(greeting())}, ${me.data.name.split(" ")[0]}` : t(greeting())} sub={me.data?.vehicle ?? t("riderApp")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 14, paddingBottom: 32 }} refreshControl={refresh}>
        <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="rider" color={c.primary} size={30} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? c.success : c.muted }} />
              <Txt bold size={17} color={online ? c.success : c.muted}>{online ? t("online") : t("offline")}</Txt>
            </View>
            <Txt size={12} muted numberOfLines={1}>{online ? t("onlineHint") : t("offlineHint")}</Txt>
          </View>
          <Switch
            value={online}
            onValueChange={(v) => {
              setOn(v);
              setOnline.mutate(v);
            }}
            trackColor={{ true: c.success, false: c.border }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat icon="box" label="deliveriesToday" value={s?.deliveries ?? 0} color={c.success} bg={c.successBg} />
          <Stat icon="navigate" label="kmToday" value={s?.km ?? 0} color={c.info} bg={c.infoBg} />
          <Stat icon="wallet" label="cashInHand" value={`₹${s?.cashInHand ?? 0}`} color={c.primary} bg={c.tint} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Txt bold size={17}>{t("currentTask")}</Txt>
          {orders.length ? (
            <Pressable onPress={() => router.push("/rider/tasks")} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Txt bold size={13} color={c.primary}>{t("viewAll")}</Txt>
              <Icon name="chevronRight" color={c.primary} size={16} />
            </Pressable>
          ) : null}
        </View>
        {next && next.status === "RIDER_ASSIGNED" ? (
          // Accepted but not collected yet: the next move is the shop, not the customer.
          <View style={{ borderRadius: 22, borderWidth: 2, borderColor: c.primary, backgroundColor: c.surface, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Icon name="shop" color={c.primary} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold size={16} numberOfLines={1}>{next.dealers?.shop_name ?? t("atShop")}</Txt>
                <Txt size={13} muted numberOfLines={1}>
                  {orders.filter((o) => o.status === "RIDER_ASSIGNED").map((o) => o.display_id).join(", ")} · ₹{orders.filter((o) => o.status === "RIDER_ASSIGNED").reduce((s2, o) => s2 + amountDue(o), 0)}
                </Txt>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Btn label={t("navigate")} icon="navigate" kind="soft" onPress={() => navigateTo({ lat: next.dealers?.lat, lng: next.dealers?.lng })} style={{ flex: 1 }} />
              <Btn label={t("atShop")} icon="box" onPress={() => router.push("/rider/tasks")} style={{ flex: 1 }} />
            </View>
          </View>
        ) : next ? (
          <StopCard o={next} stop={trip?.trip_stops.find((x) => x.order_id === next.id)} canReturn={false} />
        ) : (
          <View style={{ padding: 28, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: 8 }}>
            <Icon name="bell" color={c.muted} size={28} />
            <Txt muted style={{ textAlign: "center" }}>{t("noTask")}</Txt>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
