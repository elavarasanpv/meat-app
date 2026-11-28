import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { DeliverTo } from "@/components/DeliverTo";
import { GlassDock } from "@/components/GlassDock";
import { GROCERY, MiniCard } from "@/components/GroceryHome";
import { Icon } from "@/components/Icon";
import type { useBill } from "@/components/BillSummary";
import type { Address } from "@/hooks/useOrders";
import { useGroceryCatalog, type GroceryItem } from "@/hooks/useGrocery";
import { useHomePincode } from "@/hooks/useOffers";
import { useSlots } from "@/hooks/useOrders";
import { useLocalName, useT } from "@/i18n";
import { dayLabel, slotWindow } from "@/lib/format";
import { groceryImage, groceryThumb } from "@/lib/images";
import { formatQty, lineTotal, qtyStep, useCart, type CartItem } from "@/store/cart";
import { useVertical } from "@/store/vertical";
import { radius, useTheme } from "@/theme";
import { Photo } from "@/components/Photo";
import { BasketPerks, FreeLines } from "@/components/GroceryOffers";

/**
 * Grocery basket (GroceryCart design): the slot box with the lines inside it,
 * the free-delivery milestones with items that get the customer there, the
 * bill, and a pinned Place order. Rendered under the grocery Accent, so every
 * `c.primary` here is green.
 */
type Cta = { label: string; onPress: () => void; busy?: boolean; disabled?: boolean };

export function GroceryCart({ bill, onBack, cta, address }: { bill: ReturnType<typeof useBill>; onBack?: () => void; cta?: Cta; address?: Address | null }) {
  const { c, tone } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const [dockH, setDockH] = useState(150);
  const pincode = useHomePincode();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const upsert = useCart((s) => s.upsert);
  const setVertical = useVertical((s) => s.set);
  const catalog = useGroceryCatalog(pincode);
  const slots = useSlots();
  const slot = slots.data?.[0];

  const freeAbove = bill.freeAbove;
  const remaining = freeAbove != null ? Math.max(0, freeAbove - bill.itemTotal) : 0;
  const unlocked = bill.firstFree || (freeAbove != null && remaining === 0);
  const minReached = bill.itemTotal >= bill.minOrder;
  // Progress from 0 (empty) through the minimum to free delivery.
  const progress = freeAbove ? Math.min(1, bill.itemTotal / freeAbove) : 1;

  // Items that would close the gap, cheapest useful first; in-cart items excluded.
  const inCart = new Set(items.map((i) => i.productId));
  const suggestions = (catalog.data ?? [])
    .filter((r) => r.in_stock && !inCart.has(r.master_product_id))
    .sort((a, b) => (remaining > 0 ? Math.abs(a.selling_price - remaining) - Math.abs(b.selling_price - remaining) : (b.mrp ?? 0) - b.selling_price - ((a.mrp ?? 0) - a.selling_price)))
    .slice(0, 8);

  function addSuggested(r: GroceryItem) {
    const line: CartItem = { productId: r.master_product_id, name: r.name, nameTa: r.name_ta ?? undefined, unit: r.unit === "kg" ? "kg" : "piece", price: r.selling_price, qty: r.min_qty, vertical: "grocery", mrp: r.mrp, step: r.qty_step, minQty: r.min_qty, imagePath: r.image_path };
    upsert(line);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  const goHome = () => {
    setVertical("grocery");
    router.push("/(tabs)");
  };
  const box = { borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border } as const;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, height: 52 }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
            <Icon name="back" color={c.ink} size={18} />
          </Pressable>
        ) : null}
        <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{t("tabCart")}</AppText>
        <Pressable onPress={clear} hitSlop={8} accessibilityRole="button">
          <AppText variant="label" color={c.danger} numberOfLines={1}>{t("clearAll")}</AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: dockH + 16 }} showsVerticalScrollIndicator={false}>
        {/* Slot + lines */}
        <View style={box}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: c.surface2 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name="clock" color={c.primary} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" muted>{t("gt_arrives")} · {items.length === 1 ? t("oneItem") : t("itemsCount", { n: items.length })}</AppText>
              <AppText variant="bodyBold" style={{ fontSize: 14 }}>
                {slot ? `${dayLabel(slot.startsAt, { today: t("today"), tomorrow: t("tomorrow") })} · ${slotWindow(slot.startsAt, slot.endsAt)}` : "—"}
              </AppText>
            </View>
            <Pressable onPress={() => router.push("/checkout")} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: GROCERY.accentSoft, borderWidth: 1, borderColor: GROCERY.accent, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText variant="label" color="#3D2E00" style={{ fontSize: 12 }}>{t("changeSlot")}</AppText>
            </Pressable>
          </View>

          {items.map((item, i) => {
            const img = groceryThumb(item.imagePath);
            const step = qtyStep(item.unit, item.step);
            const min = item.minQty ?? step;
            const dec = () => {
              const next = Math.round((item.qty - step) * 1000) / 1000;
              if (next < min) remove(item.productId);
              else setQty(item.productId, next);
            };
            return (
              <View key={item.productId} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, paddingTop: i === 0 ? 12 : 0 }}>
                <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: c.tintSoft, borderWidth: 1, borderColor: tone.groceryBorder, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {img ? <Photo source={img} style={{ width: 56, height: 56 }} /> : <AppText variant="title" color={c.primary}>{item.name.charAt(0)}</AppText>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 14, lineHeight: 18 }}>{localName({ name: item.name, name_ta: item.nameTa })}</AppText>
                  <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                    {item.unit === "kg" ? `${formatQty(item.qty, item.unit)} · ₹${item.price} /${t("unitKg")}` : `${item.qty} × ₹${item.price}`}
                  </AppText>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", height: 32, borderRadius: radius.pill, backgroundColor: c.primary }}>
                    <Pressable onPress={dec} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t("remove")} ${item.name}`} style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                      <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16, lineHeight: 18 }}>−</AppText>
                    </Pressable>
                    <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ minWidth: 26, textAlign: "center", fontSize: 12.5 }}>{formatQty(item.qty, item.unit)}</AppText>
                    <Pressable onPress={() => setQty(item.productId, Math.round((item.qty + step) * 1000) / 1000)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`+ ${item.name}`} style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                      <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16, lineHeight: 18 }}>+</AppText>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Pressable onPress={() => remove(item.productId)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${t("remove")} ${item.name}`} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="trash" color={c.danger} size={14} />
                    </Pressable>
                    {item.mrp != null && item.mrp > item.price ? <AppText variant="caption" muted style={{ fontSize: 11, textDecorationLine: "line-through" }}>₹{Math.round(item.mrp * item.qty)}</AppText> : null}
                    <AppText variant="bodyBold" color={c.primary} style={{ fontSize: 14 }}>₹{lineTotal(item)}</AppText>
                  </View>
                </View>
              </View>
            );
          })}

          <FreeLines quote={bill.shopOffers} />

          <Pressable onPress={goHome} accessibilityRole="button" style={{ padding: 10, borderTopWidth: 1, borderTopColor: c.surface2, alignItems: "center" }}>
            <AppText variant="label" numberOfLines={1} style={{ fontSize: 13 }}>
              {t("addMoreTitle")} <AppText variant="label" color={c.primary} style={{ fontSize: 13 }}>{t("addMoreItems")}</AppText>
            </AppText>
          </Pressable>
        </View>

        {/* Free-delivery milestones + what gets you there */}
        {freeAbove != null && (
          <View style={{ ...box, padding: 14, paddingHorizontal: 12, gap: 12 }}>
            <AppText variant="subtitle">{bill.firstFree ? t("firstOrderFree") : unlocked ? t("freeUnlocked") : t("addMoreFree", { n: remaining })}</AppText>
            <View style={{ height: 62 }}>
              <View style={{ position: "absolute", left: 10, right: 10, top: 14, height: 3, borderRadius: 2, backgroundColor: c.surface2 }} />
              <View style={{ position: "absolute", left: 10, right: 10, top: 14, height: 3, borderRadius: 2, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: c.primary }} />
              </View>
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", justifyContent: "space-between" }}>
                <Milestone done label={t("minOrderShort")} sub={`₹${bill.minOrder}`} c={c} first />
                <Milestone done={minReached} label={t("minOrderShort")} sub={`₹${bill.minOrder}`} c={c} hidden />
                <Milestone done={unlocked} label={t("freeDeliveryShort")} sub={t("saveN", { n: bill.fee })} c={c} />
              </View>
            </View>
            {suggestions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {suggestions.map((r) => (
                  <MiniCard key={r.master_product_id} item={r} width={128} qty={items.find((i) => i.productId === r.master_product_id)?.qty ?? 0} onAdd={() => addSuggested(r)} onStep={(d) => { const cur = items.find((i) => i.productId === r.master_product_id)?.qty ?? 0; const next = Math.round((cur + d * r.qty_step) * 1000) / 1000; if (next < r.min_qty) remove(r.master_product_id); else setQty(r.master_product_id, next); }} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <BasketPerks quote={bill.shopOffers} />

        {/* Bill */}
        <View style={{ ...box, padding: 14, paddingHorizontal: 16, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="receipt" color={c.ink} size={18} />
            <AppText variant="subtitle">{t("billSummary")}</AppText>
          </View>
          <Row label={t("itemTotal")} value={`₹${bill.itemTotal}`} />
          {bill.discount > 0 && bill.shopOffers?.coupon ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <AppText variant="caption" color={c.successText} style={{ fontSize: 13, flex: 1 }}>{t("go_couponLine", { n: bill.shopOffers.coupon.pct })}</AppText>
              <AppText variant="caption" color={c.successText} style={{ fontSize: 13 }}>− ₹{bill.discount}</AppText>
            </View>
          ) : null}
          <Row label={t("deliveryFee")} value={bill.delivery === 0 ? t("free") : `₹${bill.delivery}`} />
          {!unlocked && remaining > 0 ? <AppText variant="caption" color={c.primary} style={{ marginTop: -4, fontSize: 11.5 }}>{t("freeAbove", { n: freeAbove! })} · {t("addNMore", { n: remaining })}</AppText> : null}
          {bill.firstFree ? <AppText variant="caption" color={c.primary} style={{ marginTop: -4, fontSize: 11.5 }}>{t("firstOrderFree")}</AppText> : null}
          {bill.belowMin ? <AppText variant="caption" color={c.danger} style={{ fontSize: 11.5 }}>{t("addMoreToOrder", { n: bill.minOrder - bill.itemTotal, min: bill.minOrder })}</AppText> : null}
          <View style={{ height: 1, backgroundColor: c.border }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="bodyBold">{t("toPay")}</AppText>
            <AppText variant="price" color={c.primary} style={{ fontSize: 22, lineHeight: 26 }}>₹ {bill.toPay}</AppText>
          </View>
          <AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 15 }}>{t("groceryNote")}</AppText>
        </View>
      </ScrollView>

      <GlassDock onHeight={setDockH}>
        {address !== undefined ? <DeliverTo address={address} onChange={() => router.push("/checkout")} color={c.primary} /> : null}
        <Button label={cta?.label ?? `${t("placeOrder")} · ₹ ${bill.toPay}`} onPress={cta?.onPress ?? (() => router.push("/checkout"))} loading={cta?.busy} disabled={cta?.disabled ?? bill.belowMin} />
      </GlassDock>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <AppText variant="caption" muted style={{ fontSize: 13 }}>{label}</AppText>
      <AppText variant="caption" color={c.ink} style={{ fontSize: 13 }}>{value}</AppText>
    </View>
  );
}

/** One dot on the milestone bar. `hidden` keeps the spacing for a 3-stop layout without a middle label. */
function Milestone({ done, label, sub, c, first, hidden }: { done: boolean; label: string; sub: string; c: ReturnType<typeof useTheme>["c"]; first?: boolean; hidden?: boolean }) {
  return (
    <View style={{ width: 80, alignItems: first ? "flex-start" : "center", gap: 4, opacity: hidden ? 0 : 1 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: done ? c.primary : c.tint, borderWidth: 2, borderColor: c.surface, alignItems: "center", justifyContent: "center" }}>
        {done ? <Icon name="check" color="#FFFFFF" size={14} strokeWidth={3} /> : <AppText variant="label" color={c.primary} style={{ fontSize: 12 }}>%</AppText>}
      </View>
      <AppText variant="label" numberOfLines={1} style={{ fontSize: 11 }}>{label}</AppText>
      <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5 }}>{sub}</AppText>
    </View>
  );
}
