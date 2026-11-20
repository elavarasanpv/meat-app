import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { GROCERY } from "@/components/GroceryHome";
import { Icon } from "@/components/Icon";
import { ErrorState, Skeleton } from "@/components/States";
import { useGroceryCatalog, useGroceryFee, useGroceryItem, type GroceryItem } from "@/hooks/useGrocery";
import { useHomePincode } from "@/hooks/useOffers";
import { useSlots } from "@/hooks/useOrders";
import { useLang, useLocalName, useT } from "@/i18n";
import { dayLabel, slotWindow } from "@/lib/format";
import { groceryImage } from "@/lib/images";
import { basketConflict, useCart, type CartItem } from "@/store/cart";
import { Accent, radius, useTheme, withAccent } from "@/theme";

/**
 * One grocery item: photo hero, price against MRP, the delivery rule for the
 * customer's area, the admin's description and a row of items from the same
 * category. The stepper + "Add to cart" bar stays pinned at the bottom.
 */
export default function GroceryItemScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery");
  const t = useT();
  const lang = useLang((s) => s.lang);
  const localName = useLocalName();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pincode = useHomePincode();
  const catalog = useGroceryCatalog(pincode);
  const detail = useGroceryItem(id);
  const fee = useGroceryFee(pincode);
  const slots = useSlots();

  const item = catalog.data?.find((r) => r.master_product_id === id);
  const items = useCart((s) => s.items);
  const upsert = useCart((s) => s.upsert);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const setFeeRule = useCart((s) => s.setFeeRule);
  const inCart = items.find((i) => i.productId === id);
  const [qty, setLocalQty] = useState<number | null>(null);
  const [pending, setPending] = useState<CartItem | null>(null);

  const alike = useMemo(() => (catalog.data ?? []).filter((r) => r.master_product_id !== id && r.category_id && r.category_id === item?.category_id).slice(0, 8), [catalog.data, id, item?.category_id]);
  const nextSlot = slots.data?.[0];
  const desc = lang === "ta" ? detail.data?.description_ta || detail.data?.description : detail.data?.description;

  if (!item) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground, padding: 20 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={c.ink} />
        </Pressable>
        <View style={{ marginTop: 20 }}>{catalog.isLoading ? <Skeleton style={{ height: 300, borderRadius: 24 }} /> : <ErrorState icon="cart" title={t("groceryNoItems")} onRetry={() => catalog.refetch()} />}</View>
      </SafeAreaView>
    );
  }

  const shown = qty ?? inCart?.qty ?? item.min_qty;
  const max = item.unit === "kg" ? 50 : 99;
  const step = (d: 1 | -1) => {
    const next = Math.round((shown + d * item.qty_step) * 1000) / 1000;
    if (next < item.min_qty || next > max) return;
    setLocalQty(next);
    if (inCart) setQty(item.master_product_id, next);
  };
  const line = (r: GroceryItem, q: number): CartItem => ({ productId: r.master_product_id, name: r.name, nameTa: r.name_ta ?? undefined, unit: r.unit === "kg" ? "kg" : "piece", price: r.selling_price, qty: q, vertical: "grocery", mrp: r.mrp, step: r.qty_step, minQty: r.min_qty, imagePath: r.image_path });
  function add(r: GroceryItem, q: number) {
    const l = line(r, q);
    if (basketConflict(items, l)) return setPending(l);
    if (!items.length) setFeeRule(fee.data ?? null);
    upsert(l);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  const fmt = (q: number) => (item.unit === "kg" ? `${q} ${t("unitKg")}` : `${q}`);
  const off = item.mrp && item.mrp > item.selling_price ? Math.round(((item.mrp - item.selling_price) / item.mrp) * 100) : 0;
  const img = groceryImage(item.image_path);
  const total = Math.round(item.selling_price * shown);

  return (
    <Accent value="grocery">
      <View style={{ flex: 1, backgroundColor: c.ground }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient colors={[...GROCERY.header]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: "hidden" }}>
            <View pointerEvents="none" style={{ position: "absolute", right: -50, top: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.45)" }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="back" color={c.ink} />
              </Pressable>
              <Pressable onPress={() => router.push("/(tabs)/cart")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("viewCart")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="cart" color={c.ink} size={20} />
                {items.length > 0 && <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }}><AppText variant="label" color="#FFFFFF" style={{ fontSize: 9 }}>{items.length}</AppText></View>}
              </Pressable>
            </View>
            <View style={{ height: Math.min(260, width * 0.62), alignItems: "center", justifyContent: "center", marginTop: 6 }}>
              {img ? <Image source={img} resizeMode="contain" style={{ width: "80%", height: "100%" }} /> : <AppText style={{ fontSize: 72, lineHeight: 80 }} color={c.primary}>{item.name.charAt(0)}</AppText>}
            </View>
            {off > 0 && (
              <View style={{ position: "absolute", left: 16, bottom: 16, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: GROCERY.accent, justifyContent: "center" }}>
                <AppText variant="label" color="#3D2E00" style={{ fontSize: 11 }}>{t("offMrp", { n: off })}</AppText>
              </View>
            )}
            {!item.in_stock && (
              <View style={{ position: "absolute", right: 16, bottom: 16, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: "rgba(28,23,21,0.6)", justifyContent: "center" }}>
                <AppText variant="label" color="#FFFFFF" style={{ fontSize: 11 }}>{t("outOfStock")}</AppText>
              </View>
            )}
          </LinearGradient>

          <View style={{ padding: 16, gap: 14 }}>
            {/* Name · pack · price */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="title" style={{ fontSize: 22, lineHeight: 26 }}>{localName(item)}</AppText>
                <AppText variant="caption" muted>{[item.brand, item.pack_size ?? (item.unit === "kg" ? `/ ${t("unitKg")}` : null)].filter(Boolean).join(" · ")}</AppText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText variant="price" color={c.primary} style={{ fontSize: 24, lineHeight: 28 }}>₹ {item.selling_price}</AppText>
                {item.mrp != null && item.mrp > item.selling_price ? <AppText variant="caption" muted style={{ textDecorationLine: "line-through" }}>MRP ₹{item.mrp}</AppText> : null}
              </View>
            </View>

            {/* Trust strip: the delivery rule for this pincode */}
            <View style={{ flexDirection: "row", padding: 12, borderRadius: 18, backgroundColor: c.tint, borderWidth: 1, borderColor: "#BFE4CB" }}>
              <Trust icon="cart" top={t("minOrderShort")} sub={fee.data ? `₹${fee.data.minOrder}` : "—"} c={c} />
              <View style={{ width: 1, backgroundColor: "#BFE4CB" }} />
              <Trust icon="scooter" top={t("deliveryFee")} sub={fee.data?.freeAbove != null ? t("freeAbove", { n: fee.data.freeAbove }) : fee.data ? `₹${fee.data.fee}` : "—"} c={c} />
              <View style={{ width: 1, backgroundColor: "#BFE4CB" }} />
              <Trust icon="clock" top={t("gt_arrives")} sub={nextSlot ? `${dayLabel(nextSlot.startsAt, { today: t("today"), tomorrow: t("tomorrow") })} · ${slotWindow(nextSlot.startsAt, nextSlot.endsAt)}` : "—"} c={c} />
            </View>

            {/* Description */}
            {desc ? (
              <View style={{ gap: 4 }}>
                <AppText variant="subtitle">{t("aboutItem")}</AppText>
                <AppText variant="caption" muted style={{ lineHeight: 19, fontSize: 13 }}>{desc}</AppText>
              </View>
            ) : null}

            {/* Same category */}
            {alike.length > 0 && (
              <View style={{ gap: 8 }}>
                <AppText variant="subtitle">{t("alsoLike")}</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {alike.map((r) => {
                    const ri = groceryImage(r.image_path);
                    const has = items.find((i) => i.productId === r.master_product_id);
                    return (
                      <Pressable key={r.master_product_id} onPress={() => router.push(`/grocery/item/${r.master_product_id}`)} accessibilityRole="button" style={{ width: 124, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: "#DCEBDD", padding: 8, gap: 6 }}>
                        <View style={{ height: 64, borderRadius: 10, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {ri ? <Image source={ri} resizeMode="contain" style={{ width: 56, height: 56 }} /> : <AppText variant="title" color={c.primary}>{r.name.charAt(0)}</AppText>}
                        </View>
                        <AppText variant="label" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 15 }}>{localName(r)}</AppText>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <AppText variant="bodyBold" color={c.primary} style={{ fontSize: 12 }}>₹{r.selling_price}</AppText>
                          <Pressable onPress={() => (has ? setQty(r.master_product_id, has.qty + r.qty_step) : add(r, r.min_qty))} hitSlop={6} accessibilityRole="button" accessibilityLabel={t("add")} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                            <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16, lineHeight: 18 }}>+</AppText>
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Pinned stepper + add */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.surface }}>
            <Pressable onPress={() => step(-1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Less" style={{ width: 44, height: 52, alignItems: "center", justifyContent: "center" }}>
              <AppText variant="bodyBold" color={c.primary} style={{ fontSize: 20, lineHeight: 22 }}>−</AppText>
            </Pressable>
            <AppText variant="bodyBold" numberOfLines={1} style={{ minWidth: 44, textAlign: "center", fontSize: 14 }}>{fmt(shown)}</AppText>
            <Pressable onPress={() => step(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="More" style={{ width: 44, height: 52, alignItems: "center", justifyContent: "center" }}>
              <AppText variant="bodyBold" color={c.primary} style={{ fontSize: 20, lineHeight: 22 }}>+</AppText>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={inCart ? `${t("viewCart")} · ₹ ${total}` : `${t("addToCart")} · ₹ ${total}`}
              icon="cart"
              disabled={!item.in_stock}
              onPress={() => (inCart ? router.push("/(tabs)/cart") : add(item, shown))}
            />
          </View>
        </View>

        <ConfirmSheet visible={!!pending} title={t("newBasketTitle")} message={t("newBasketMsg", { name: t("meatTab") })} confirmLabel={t("newBasketConfirm")} icon="cart" destructive={false} onConfirm={() => { if (!pending) return; clear(); setFeeRule(fee.data ?? null); upsert(pending); setPending(null); }} onClose={() => setPending(null)} />
      </View>
    </Accent>
  );
}

function Trust({ icon, top, sub, c }: { icon: "cart" | "scooter" | "clock"; top: string; sub: string; c: ReturnType<typeof useTheme>["c"] }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 4 }}>
      <Icon name={icon} color={c.primary} size={icon === "scooter" ? 24 : 18} />
      <AppText variant="label" numberOfLines={1} style={{ fontSize: 11 }}>{top}</AppText>
      <AppText variant="caption" muted numberOfLines={2} style={{ fontSize: 10.5, lineHeight: 13, textAlign: "center" }}>{sub}</AppText>
    </View>
  );
}
