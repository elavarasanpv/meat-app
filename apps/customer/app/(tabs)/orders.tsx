import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState, ListSkeleton } from "@/components/States";
import { useOrders, type OrderSummary } from "@/hooks/useOrders";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { dateTime } from "@/lib/format";
import { productImage } from "@/lib/images";
import { useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";
import { queryState } from "@/lib/network";

const HANDOFF = require("@freshcut/assets/images/doodle-handoff.png");
const CLOSED = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED", "RETURNED", "REFUNDED"];
const THUMBS = 4;

/** One order: status + amount, when it was placed, what was in it, then Order again or Track. */
function OrderCard({ o }: { o: OrderSummary }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const upsert = useCart((s) => s.upsert);
  const [added, setAdded] = useState(false);
  const items = o.order_items.filter((i) => i.products);
  const closed = CLOSED.includes(o.status);
  const open = () => router.push({ pathname: "/order/[id]", params: { id: o.id } });

  // Put the same items back in the cart at today's prices; skip anything no longer sold.
  function orderAgain() {
    const sellable = items.filter((i) => i.products!.is_active);
    if (!sellable.length) return;
    for (const i of sellable) {
      const p = i.products!;
      upsert({ productId: i.product_id, name: p.name, nameTa: p.name_ta ?? undefined, unit: p.unit, price: Number(p.base_price_per_kg), qty: Number(i.requested_kg), size: (i.size as "small" | "medium" | "large" | null) ?? undefined });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAdded(true);
    setTimeout(() => router.push("/(tabs)/cart"), 350);
  }
  const canReorder = closed && items.some((i) => i.products!.is_active);

  return (
    <View style={{ borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ padding: 14, gap: 10, backgroundColor: pressed ? c.tintSoft : c.surface })}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <StatusBadge status={o.status} />
              <AppText variant="caption" muted numberOfLines={1}>{o.display_id}</AppText>
            </View>
            <AppText variant="caption" muted numberOfLines={1}>{t("placedAt", { when: dateTime(o.created_at) })}</AppText>
          </View>
          <AppText variant="price" color={c.price} numberOfLines={1} style={{ fontSize: 17, lineHeight: 21 }}>₹ {Number(o.final_amount ?? o.est_amount)}</AppText>
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", transform: [{ rotate: "180deg" }] }}>
            <Icon name="back" color={c.muted} size={16} strokeWidth={2.4} />
          </View>
        </View>

        {/* what was in it */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {items.slice(0, THUMBS).map((i) => {
            const img = productImage(i.products!.name, i.products!.image_path);
            return (
              <View key={i.id} style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: c.tintSoft, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: i.unavailable ? 0.45 : 1 }}>
                {img ? <Image source={img} resizeMode="contain" style={{ width: 52, height: 52 }} /> : <AppText variant="title" color={c.price}>{i.products!.name.charAt(0)}</AppText>}
              </View>
            );
          })}
          {items.length > THUMBS ? (
            <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
              <AppText variant="bodyBold" muted>+{items.length - THUMBS}</AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={{ height: 1, backgroundColor: c.border }} />
      {closed ? (
        <Pressable
          onPress={canReorder ? orderAgain : undefined}
          disabled={!canReorder || added}
          accessibilityRole="button"
          style={({ pressed }) => ({ height: 46, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: pressed ? c.tintSoft : c.surface })}
        >
          {canReorder ? <Icon name={added ? "check" : "cart"} color={added ? c.success : c.price} size={16} /> : null}
          <AppText variant="bodyBold" color={added ? c.success : canReorder ? c.price : c.muted} style={{ fontSize: 14 }}>
            {added ? t("orderAgainAdded") : canReorder ? t("orderAgain") : t("orderAgainNone")}
          </AppText>
        </Pressable>
      ) : (
        <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ height: 46, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: pressed ? c.tintSoft : c.surface })}>
          <Icon name="scooter" color={c.price} size={16} />
          <AppText variant="bodyBold" color={c.price} style={{ fontSize: 14 }}>{t("track")}</AppText>
        </Pressable>
      )}
    </View>
  );
}

export default function OrdersScreen() {
  const { c } = useTheme();
  const refresh = usePullRefresh([["orders"]]);
  const t = useT();
  const router = useRouter();
  const orders = useOrders();
  const st = queryState(orders);

  if (orders.data && orders.data.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
          <Image source={HANDOFF} resizeMode="contain" style={{ width: 260, height: 240 }} />
          <AppText variant="title" numberOfLines={1}>{t("noOrders")}</AppText>
          <AppText muted numberOfLines={2} style={{ textAlign: "center", maxWidth: 280 }}>{t("noOrdersSub")}</AppText>
          <View style={{ width: 220, marginTop: 4 }}>
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
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 12 }} refreshControl={refresh}>
        {st.loading ? <ListSkeleton rows={4} height={150} /> : null}
        {st.failed ? <ErrorState onRetry={() => orders.refetch()} /> : null}
        {(orders.data ?? []).map((o) => (
          <OrderCard key={o.id} o={o} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
