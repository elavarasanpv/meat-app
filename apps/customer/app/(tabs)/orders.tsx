import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrders } from "@/hooks/useOrders";
import { dayLabel, slotWindow } from "@/lib/format";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

export default function OrdersScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const orders = useOrders();

  if (orders.data && orders.data.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="orders" color={c.primary} size={32} />
          </View>
          <AppText variant="title" numberOfLines={1}>{t("noOrders")}</AppText>
          <View style={{ width: 220 }}>
            <Button label={t("browseProducts")} size="sm" onPress={() => router.push("/(tabs)")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, height: 40, justifyContent: "center" }}>
        <AppText variant="title" numberOfLines={1}>{t("tabOrders")}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 10 }}>
        {orders.isError ? (
          <Pressable onPress={() => orders.refetch()}><AppText muted>{t("loadError")}</AppText></Pressable>
        ) : null}
        {(orders.data ?? []).map((o) => (
          <Pressable
            key={o.id}
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}
            accessibilityRole="button"
            style={({ pressed }) => ({ padding: 14, borderRadius: 18, backgroundColor: pressed ? c.tintSoft : c.surface, borderWidth: 1, borderColor: c.border, gap: 8 })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText variant="subtitle" numberOfLines={1}>{o.display_id}</AppText>
              <StatusBadge status={o.status} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText variant="caption" muted numberOfLines={1}>
                {t("itemsCount", { n: o.order_items.length })}
                {o.delivery_slots ? ` · ${dayLabel(o.delivery_slots.starts_at, { today: t("today"), tomorrow: t("tomorrow") })} ${slotWindow(o.delivery_slots.starts_at, o.delivery_slots.ends_at)}` : ""}
              </AppText>
              <AppText variant="price" color={c.price} numberOfLines={1} style={{ fontSize: 15, lineHeight: 19 }}>₹ {Number(o.final_amount ?? o.est_amount)}</AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
