import { useState } from "react";
import { ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { StopCard } from "@/components/StopCard";
import { usePullRefreshKeys } from "@/hooks/usePullRefresh";
import { amountDue, usePickup, useRiderMe, useTasks, type RiderOrder } from "@/hooks/useRider";
import { navigateTo } from "@/lib/maps";
import { useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

/**
 * The rider's work, top to bottom:
 *  1. orders accepted but not yet collected → "At the shop" card with Picked up;
 *  2. the open trip → one StopCard per customer in sequence;
 *  3. failed stops → Return to shop once the other stops are done.
 */
export default function TasksScreen() {
  const c = useC();
  const t = useT();
  const refresh = usePullRefreshKeys([["rider"]]);
  const me = useRiderMe();
  const tasks = useTasks(me.data?.id);
  const pickup = usePickup();
  const [picking, setPicking] = useState<Set<string>>(new Set());

  const orders = tasks.data?.orders ?? [];
  const trip = tasks.data?.trip ?? null;
  const toCollect = orders.filter((o) => o.status === "RIDER_ASSIGNED");
  const stopOf = (o: RiderOrder) => trip?.trip_stops.find((s) => s.order_id === o.id);
  const onTrip = orders.filter((o) => o.status !== "RIDER_ASSIGNED" && stopOf(o)).sort((a, b) => (stopOf(a)!.seq ?? 0) - (stopOf(b)!.seq ?? 0));
  const openStops = onTrip.filter((o) => o.status === "OUT_FOR_DELIVERY").length;
  // Failed packets go back only after every other stop is handled.
  const canReturn = openStops === 0;

  const selected = toCollect.filter((o) => picking.size === 0 || picking.has(o.id));
  const shop = toCollect[0]?.dealers;

  async function onPickup() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await pickup.mutateAsync(selected.map((o) => o.id));
    setPicking(new Set());
  }

  const empty = !toCollect.length && !onTrip.length;

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabTasks")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }} refreshControl={refresh}>
        {toCollect.length ? (
          <View style={{ borderRadius: 22, borderWidth: 2, borderColor: c.primary, backgroundColor: c.surface, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Icon name="shop" color={c.primary} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold size={17} numberOfLines={1}>{shop?.shop_name ?? t("atShop")}</Txt>
                <Txt size={13} muted>{t("pickupHint")}</Txt>
              </View>
              <Btn label={t("navigate")} icon="navigate" kind="soft" onPress={() => navigateTo({ lat: shop?.lat, lng: shop?.lng })} />
            </View>
            <View style={{ gap: 6 }}>
              {toCollect.map((o) => {
                const on = picking.size === 0 || picking.has(o.id);
                return (
                  <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: on ? c.tintSoft : c.surface2 }}>
                    <Icon name="box" color={on ? c.primary : c.muted} size={20} filled={on} />
                    <Txt bold size={14} style={{ flex: 1 }}>{o.display_id}</Txt>
                    <Txt size={13} muted>{o.order_items.length} items · ₹{amountDue(o)}</Txt>
                  </View>
                );
              })}
            </View>
            <Btn
              label={selected.length > 1 ? t("pickedUpN").replace("{n}", String(selected.length)) : t("pickedUp")}
              icon="check"
              kind="success"
              big
              onPress={onPickup}
              loading={pickup.isPending}
              disabled={!!trip || selected.length === 0}
            />
            {trip ? <Txt size={12} muted style={{ textAlign: "center" }}>{t("tripDone")} → {t("pickedUp")}</Txt> : null}
          </View>
        ) : null}

        {onTrip.map((o) => (
          <StopCard key={o.id} o={o} stop={stopOf(o)} canReturn={canReturn} />
        ))}

        {empty ? (
          <View style={{ padding: 28, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: 8, marginTop: 40 }}>
            <Icon name="scooter" color={c.muted} size={30} />
            <Txt muted style={{ textAlign: "center" }}>{t("noTask")}</Txt>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
