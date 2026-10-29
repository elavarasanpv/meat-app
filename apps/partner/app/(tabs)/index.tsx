import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Header } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { OrderCard } from "@/components/OrderCard";
import { useDealerMe, useDealerOrders, useShopState, useSummary } from "@/hooks/useDealer";
import { useT, type TKey } from "@/i18n";
import { Txt, useC } from "@/ui";

function greeting(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "goodMorning" : h < 17 ? "goodAfternoon" : "goodEvening";
}

/** Home: shop switch, today's numbers, and the order that needs attention most. */
export default function HomeScreen() {
  const c = useC();
  const t = useT();
  const router = useRouter();
  const me = useDealerMe();
  const summary = useSummary(me.data?.id);
  const orders = useDealerOrders(me.data?.id);
  const shop = useShopState();
  const [open, setOpen] = useState(me.data?.is_open ?? false);
  useEffect(() => {
    if (me.data) setOpen(me.data.is_open);
  }, [me.data?.is_open]);

  const s = summary.data;
  // Most urgent first: a new offer, then anything being prepared, then ready.
  const rank: Record<string, number> = { DEALER_ASSIGNED: 0, ACCEPTED: 1, PACKING: 2, PACKED: 3 };
  const latest = [...(orders.data ?? [])].sort((a, b) => rank[a.status] - rank[b.status])[0];

  const Stat = ({ icon, label, value, color, bg, onPress }: { icon: IconName; label: TKey; value: number | string; color: string; bg: string; onPress?: () => void }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={color} size={20} />
      </View>
      <Txt bold size={24}>{value}</Txt>
      <Txt size={12} muted numberOfLines={1}>{t(label)}</Txt>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title={t(greeting())} sub={me.data?.shop_name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 14, paddingBottom: 32 }}>
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
          <Stat icon="inbox" label="newOrders" value={s?.newCount ?? 0} color={c.primary} bg={c.tint} onPress={() => router.push("/(tabs)/orders")} />
          <Stat icon="cut" label="inProgress" value={s?.inProgressCount ?? 0} color={c.warning} bg={c.warningBg} onPress={() => router.push("/(tabs)/orders")} />
          <Stat icon="scooter" label="readyPickup" value={s?.readyCount ?? 0} color={c.success} bg={c.successBg} onPress={() => router.push("/(tabs)/orders")} />
        </View>

        {/* Today */}
        <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={13} muted>{t("ordersToday")}</Txt>
            <Txt bold size={26}>{s?.todayOrders ?? 0}</Txt>
          </View>
          <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 14 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={13} muted>{t("salesToday")}</Txt>
            <Txt bold size={26} color={c.primary}>₹{s?.todaySales ?? 0}</Txt>
          </View>
        </View>

        {/* Latest order */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Txt bold size={17}>{t("latestOrder")}</Txt>
          {latest ? (
            <Pressable onPress={() => router.push("/(tabs)/orders")} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Txt bold size={13} color={c.primary}>{t("viewAll")}</Txt>
              <Icon name="chevronRight" color={c.primary} size={16} />
            </Pressable>
          ) : null}
        </View>
        {latest ? (
          <OrderCard o={latest} />
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
