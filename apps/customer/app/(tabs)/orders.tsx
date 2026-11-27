import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { statusKey, statusKind, useStatusTone } from "@/components/StatusBadge";
import { ErrorState, ListSkeleton } from "@/components/States";
import { useOrders, type OrderSummary } from "@/hooks/useOrders";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { dateTime } from "@/lib/format";
import { productImage } from "@/lib/images";
import { useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { Accent, useTheme } from "@/theme";
import { useVertical } from "@/store/vertical";
import { queryState } from "@/lib/network";
import { Photo } from "@/components/Photo";
import { Star } from "@/components/Stars";

const HANDOFF = require("@thanjozmart/assets/images/doodle-handoff.webp");
const HANDOFF_GROCERY = require("@thanjozmart/assets/images/doodle-handoff-grocery.webp");
const CLOSED = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED", "RETURNED", "REFUNDED"];
const THUMBS = 4;
const STATUS_ICON = { done: "check", problem: "close", moving: "scooter", waiting: "clock" } as const;

/** One order: status + amount, when it was placed, what was in it, then Rate order / Order again, or Track. */
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
    const grocery = o.vertical_type === "grocery";
    for (const i of sellable) {
      const p = i.products!;
      upsert({
        productId: (grocery ? i.master_product_id : i.product_id) ?? "",
        name: p.name,
        nameTa: p.name_ta ?? undefined,
        unit: p.unit,
        price: Number(p.base_price_per_kg),
        qty: Number(i.requested_kg),
        size: (i.size as "small" | "medium" | "large" | null) ?? undefined,
        ...(grocery ? { vertical: "grocery" as const, imagePath: p.image_path, step: p.qty_step, minQty: p.min_qty } : {}),
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAdded(true);
    setTimeout(() => router.push("/(tabs)/cart"), 350);
  }
  const canReorder = closed && items.some((i) => i.products!.is_active);
  // Delivered and not rated yet: offer "Rate order" beside "Order again".
  const canRate = o.status === "DELIVERED" && !o.order_ratings;

  const tone = useStatusTone(o.status);
  const count = items.length === 1 ? t("itemsCountOne") : t("itemsCount", { n: items.length });

  return (
    <View style={{ borderRadius: 22, backgroundColor: c.surface, borderWidth: closed ? 1 : 1.5, borderColor: closed ? c.border : c.primary, overflow: "hidden" }}>
      <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ padding: 14, gap: 12, backgroundColor: pressed ? c.tintSoft : c.surface })}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
            <Icon name={STATUS_ICON[statusKind(o.status)]} color={tone.fg} size={18} strokeWidth={2.6} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText variant="bodyBold" color={c.ink} style={{ fontSize: 16 }}>{t(statusKey(o.status, o.vertical_type))}</AppText>
            <AppText variant="caption" muted>{t("placedAt", { when: dateTime(o.created_at) })}</AppText>
          </View>
          <AppText variant="price" color={c.ink} style={{ fontSize: 18, lineHeight: 22 }}>₹{Number(o.final_amount ?? o.est_amount)}</AppText>
          <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", transform: [{ rotate: "180deg" }] }}>
            <Icon name="back" color={c.muted} size={15} strokeWidth={2.4} />
          </View>
        </View>

        {/* what was in it */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {items.slice(0, THUMBS).map((i) => {
            const img = productImage(i.products!.name, i.products!.image_path);
            return (
              <View key={i.id} style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: i.unavailable ? 0.45 : 1 }}>
                {img ? <Photo source={img} style={{ width: 50, height: 50 }} /> : <AppText variant="title" color={c.price}>{i.products!.name.charAt(0)}</AppText>}
              </View>
            );
          })}
          {items.length > THUMBS ? (
            <View style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
              <AppText variant="bodyBold" muted>+{items.length - THUMBS}</AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" muted>{count} · {o.display_id}</AppText>
      </Pressable>

      <View style={{ height: 1, backgroundColor: c.border }} />
      {closed ? (
        <View style={{ flexDirection: "row" }}>
          {canRate ? (
            <>
              <Pressable onPress={() => router.push({ pathname: "/rate/[id]", params: { id: o.id } })} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, minHeight: 48, paddingVertical: 10, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: pressed ? c.tintSoft : c.surface })}>
                <Star size={17} filled={false} color={c.ink} />
                <AppText variant="bodyBold" color={c.ink} style={{ fontSize: 15, textAlign: "center", flexShrink: 1 }}>{t("rateOrder")}</AppText>
              </Pressable>
              <View style={{ width: 1, backgroundColor: c.border }} />
            </>
          ) : null}
          <Pressable
            onPress={canReorder ? orderAgain : undefined}
            disabled={!canReorder || added}
            accessibilityRole="button"
            style={({ pressed }) => ({ flex: 1, minHeight: 48, paddingVertical: 10, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: pressed ? c.tintSoft : c.surface })}
          >
            {canReorder ? <Icon name={added ? "check" : "cart"} color={added ? c.success : c.price} size={16} /> : null}
            <AppText variant="bodyBold" color={added ? c.success : canReorder ? c.price : c.muted} style={{ fontSize: 15, textAlign: "center", flexShrink: 1 }}>
              {added ? t("orderAgainAdded") : canReorder ? t("orderAgain") : t("orderAgainNone")}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 48, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: c.tintSoft, opacity: pressed ? 0.8 : 1 })}>
          <Icon name="scooter" color={c.price} size={17} />
          <AppText variant="bodyBold" color={c.price} style={{ fontSize: 15 }}>{t("track")}</AppText>
        </Pressable>
      )}
    </View>
  );
}

/** "No orders yet", in the colours, picture and words of the section the customer is in. */
function NoOrders({ grocery }: { grocery: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <Photo source={grocery ? HANDOFF_GROCERY : HANDOFF} style={grocery ? { width: 240, height: 260 } : { width: 260, height: 240 }} />
        <AppText variant="title" style={{ textAlign: "center" }}>{t("noOrders")}</AppText>
        <AppText muted style={{ textAlign: "center", maxWidth: 280 }}>{t(grocery ? "noOrdersSubGrocery" : "noOrdersSub")}</AppText>
        <View style={{ width: 220, marginTop: 4 }}>
          <Button label={t("browseProducts")} size="sm" onPress={() => router.push("/(tabs)")} />
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function OrdersScreen() {
  const { c } = useTheme();
  const refresh = usePullRefresh([["orders"]]);
  const t = useT();
  const router = useRouter();
  const orders = useOrders();
  const vertical = useVertical((v) => v.vertical);
  const st = queryState(orders);
  const list = orders.data?.pages.flatMap((p) => p.rows) ?? [];

  if (orders.data && list.length === 0) return <Accent value={vertical}><NoOrders grocery={vertical === "grocery"} /></Accent>;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, height: 40, justifyContent: "center" }}>
        <AppText variant="title" numberOfLines={1}>{t("tabOrders")}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 12 }} refreshControl={refresh}>
        {st.loading ? <ListSkeleton rows={4} height={150} /> : null}
        {st.failed ? <ErrorState onRetry={() => orders.refetch()} /> : null}
        {list.map((o) => (
          <OrderCard key={o.id} o={o} />
        ))}
        {orders.hasNextPage ? (
          <Pressable
            onPress={() => orders.fetchNextPage()}
            disabled={orders.isFetchingNextPage}
            accessibilityRole="button"
            style={({ pressed }) => ({ alignSelf: "center", marginTop: 6, minHeight: 44, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1.5, borderColor: c.primary, backgroundColor: pressed ? c.tintSoft : c.surface, flexDirection: "row", alignItems: "center", gap: 8 })}
          >
            {orders.isFetchingNextPage ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="chevronDown" color={c.price} size={16} strokeWidth={2.6} />}
            <AppText variant="bodyBold" color={c.price} style={{ fontSize: 15 }}>{t("loadMore")}</AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
