import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Header } from "@/components/Header";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { Icon, type IconName } from "@/components/Icon";
import { OrderCard } from "@/components/OrderCard";
import { byUrgency, useDealerMe, useDealerOrders, useShopState, useSummary } from "@/hooks/useDealer";
import { readyState } from "@/components/ReadyBy";
import { useT, type TKey } from "@/i18n";
import { Txt, useC } from "@/ui";

function greeting(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "goodMorning" : h < 17 ? "goodAfternoon" : "goodEvening";
}

/** Home: shop switch, today's numbers, and the order that needs attention most. */
export default function HomeScreen() {
  const c = useC();
  const refresh = usePullRefresh();
  const t = useT();
  const router = useRouter();
  const me = useDealerMe();
  const summary = useSummary(me.data?.id);
  const orders = useDealerOrders(me.data?.id);
  const shop = useShopState();
  const [open, setOpen] = useState(me.data?.is_open ?? false);
  const grocery = me.data?.store_type === "grocery";
  useEffect(() => {
    if (me.data) setOpen(me.data.is_open);
  }, [me.data?.is_open]);

  const s = summary.data;
  // The order to act on first (the answer window closing soonest), and how many more new ones wait behind it.
  const latest = [...(orders.data ?? [])].sort(byUrgency)[0];
  const moreNew = latest?.status === "DEALER_ASSIGNED" ? (orders.data ?? []).filter((o) => o.status === "DEALER_ASSIGNED").length - 1 : 0;
  // Orders past their promised ready time (refreshed with the 15 s poll).
  const lateCount = (orders.data ?? []).filter((o) => o.ready_by && (o.status === "ACCEPTED" || o.status === "PACKING") && readyState(o.ready_by, Date.now()).phase === "late").length;

  const Stat = ({ icon, label, value, color, bg, onPress, warn }: { icon: IconName; label: TKey; value: number | string; color: string; bg: string; onPress?: () => void; warn?: string }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: warn ? 2 : 1, borderColor: warn ? c.danger : c.border, gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={color} size={icon === "cut" ? 24 : 20} />
      </View>
      <Txt bold size={24}>{value}</Txt>
      <Txt size={12} muted numberOfLines={1}>{t(label)}</Txt>
      {warn ? <Txt bold size={12} color={c.danger} numberOfLines={1}>{warn}</Txt> : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title={t(greeting())} sub={me.data?.shop_name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 14, paddingBottom: 32 }} refreshControl={refresh}>
        {/* Shop switch */}
        <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shop" color={c.primary} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: open ? c.success : c.muted }} />
              <Txt bold size={17} color={open ? c.success : c.muted}>{open ? t("shopOpen") : t("shopClosed")}</Txt>
            </View>
            <Txt size={12} muted numberOfLines={1}>{open ? t("openHint") : t("closedHint")}</Txt>
          </View>
          <Switch
            value={open}
            onValueChange={(v) => {
              setOpen(v);
              shop.mutate({ isOpen: v });
            }}
            trackColor={{ true: c.success, false: c.border }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Stage counts */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat icon="inbox" label="newOrders" value={s?.newCount ?? 0} color={c.primary} bg={c.tint} onPress={() => router.push({ pathname: "/(tabs)/orders", params: { seg: "new", at: String(Date.now()) } })} />
          <Stat icon="cut" label="inProgress" value={s?.inProgressCount ?? 0} color={c.warning} bg={c.warningBg} warn={lateCount ? `${lateCount} ${t("late")}` : undefined} onPress={() => router.push({ pathname: "/(tabs)/orders", params: { seg: "progress", at: String(Date.now()) } })} />
          <Stat icon="scooter" label="readyPickup" value={s?.readyCount ?? 0} color={c.success} bg={c.successBg} onPress={() => router.push({ pathname: "/(tabs)/orders", params: { seg: "ready", at: String(Date.now()) } })} />
        </View>

        {/* Today */}
        <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 12 }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={13} muted>{t("ordersToday")}</Txt>
              <Txt bold size={26}>{s?.todayOrders ?? 0}</Txt>
            </View>
            <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 14 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={13} muted>{t(grocery ? "youGetToday" : "salesToday")}</Txt>
              <Txt bold size={26} color={c.primary}>₹{s?.todaySales ?? 0}</Txt>
            </View>
          </View>
          {/* Grocery: how today's amount is made up, app charge included */}
          {grocery ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Txt size={14} muted style={{ flex: 1 }}>{t("itemsYourPrice")}</Txt>
                <Txt size={14}>₹{s?.todayItems ?? s?.todaySales ?? 0}</Txt>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Txt size={14} muted style={{ flex: 1 }}>{t("appCharge")}</Txt>
                <Txt size={14}>{s?.todayAppCharge ? `− ₹${s.todayAppCharge}` : "₹0"}</Txt>
              </View>
            </View>
          ) : null}
        </View>

        {/* Latest order */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Txt bold size={17}>{t(latest?.status === "DEALER_ASSIGNED" ? "answerFirst" : "latestOrder")}</Txt>
          {latest ? (
            <Pressable onPress={() => router.push("/(tabs)/orders")} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Txt bold size={13} color={c.primary}>{t("viewAll")}</Txt>
              <Icon name="chevronRight" color={c.primary} size={16} />
            </Pressable>
          ) : null}
        </View>
        {latest ? (
          <>
            <OrderCard o={latest} />
            {moreNew > 0 ? (
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/orders", params: { seg: "new", at: String(Date.now()) } })}
                style={{ padding: 14, borderRadius: 18, backgroundColor: c.tint, flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Icon name="inbox" color={c.primary} size={20} />
                <Txt bold size={15} color={c.primary} style={{ flex: 1 }}>{t(moreNew === 1 ? "moreNewOne" : "moreNewN").replace("{n}", String(moreNew))}</Txt>
                <Icon name="chevronRight" color={c.primary} size={18} />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={{ padding: 28, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: 8 }}>
            <Icon name="bell" color={c.muted} size={28} />
            <Txt muted style={{ textAlign: "center" }}>{t("allQuiet")}</Txt>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
