import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { BillSummary, useBill } from "@/components/BillSummary";
import { Button } from "@/components/Button";
import { DeliverTo } from "@/components/DeliverTo";
import { GlassDock } from "@/components/GlassDock";
import { Icon } from "@/components/Icon";
import { useHomePincode } from "@/hooks/useOffers";
import { usePlaceOrder, useSelectedAddress, useSlots } from "@/hooks/useOrders";
import { useLocalName, useT } from "@/i18n";
import { dayLabel, slotWindow } from "@/lib/format";
import { cartImage } from "@/lib/images";
import { errorMessage } from "@/lib/network";
import { formatQty, lineTotal, qtyStep, useCart } from "@/store/cart";
import { useVertical } from "@/store/vertical";
import { radius, useTheme } from "@/theme";

/**
 * Full-screen meat cart (no tab bar), laid out like the grocery one: back
 * arrow to Home, the slot box with the lines inside it, "Forgot something?",
 * coupon + bill, and one full-width button pinned at the bottom. Exactly one
 * saved address places the order right here (shown slot, cash on delivery);
 * none or several sends the customer to checkout to pick one.
 */
export default function MeatCartScreen() {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const [dockH, setDockH] = useState(150);
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const coupon = useCart((s) => s.coupon);
  const setVertical = useVertical((s) => s.set);
  const bill = useBill(useHomePincode());
  const slots = useSlots();
  const place = usePlaceOrder();
  const [error, setError] = useState<string | null>(null);

  const single = useSelectedAddress();
  const slot = slots.data?.[0];

  const back = () => {
    setVertical("meat");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };
  const goHome = () => {
    setVertical("meat");
    router.push("/(tabs)");
  };

  async function placeNow() {
    if (!single || !slot) return;
    setError(null);
    try {
      const result = await place.mutateAsync({
        addressId: single.id,
        slot: { startsAt: slot.startsAt, endsAt: slot.endsAt },
        paymentMode: "cod",
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, size: i.size, notes: i.notes })),
        couponCode: coupon ?? undefined,
      });
      clear();
      router.replace({ pathname: "/order/[id]", params: { id: result.orderId, placed: "1" } });
    } catch (e) {
      setError(`${t("orderFailed")} — ${errorMessage(e, t)}`);
    }
  }

  // An empty basket has nothing to show here; the Cart tab has the empty state.
  useEffect(() => {
    if (items.length === 0) back();
  }, [items.length]);
  if (items.length === 0) return null;

  const box = { borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border } as const;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, height: 52 }}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={c.ink} size={18} />
        </Pressable>
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
            <Pressable onPress={() => router.push("/checkout")} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.tintSoft, borderWidth: 1, borderColor: c.tint, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText variant="label" color={c.price} style={{ fontSize: 12 }}>{t("changeSlot")}</AppText>
            </Pressable>
          </View>

          {items.map((item, i) => {
            const img = cartImage(item);
            const step = qtyStep(item.unit, item.step);
            const dec = () => {
              const next = Math.round((item.qty - step) * 2) / 2;
              if (next <= 0) remove(item.productId);
              else setQty(item.productId, next);
            };
            return (
              <View key={item.productId} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, paddingTop: i === 0 ? 12 : 0 }}>
                <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: c.tintSoft, borderWidth: 1, borderColor: c.tint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {img ? <Image source={img} resizeMode="contain" style={{ width: 56, height: 56 }} /> : <AppText variant="title" color={c.price}>{item.name.charAt(0)}</AppText>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 14, lineHeight: 18 }}>{localName({ name: item.name, name_ta: item.nameTa })}</AppText>
                  <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                    ₹ {item.price} {t(item.unit === "piece" ? "perPiece" : "perKg")}
                    {item.size ? ` · ${t(item.size === "small" ? "sizeSmall" : item.size === "medium" ? "sizeMedium" : "sizeLarge")}` : ""}
                  </AppText>
                  {item.notes ? (
                    <AppText variant="caption" muted numberOfLines={1} style={{ fontStyle: "italic" }}>“{item.notes}”</AppText>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", height: 32, borderRadius: radius.pill, backgroundColor: c.primary }}>
                    <Pressable onPress={dec} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t("remove")} ${item.name}`} style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                      <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16, lineHeight: 18 }}>−</AppText>
                    </Pressable>
                    <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ minWidth: 44, textAlign: "center", fontSize: 12.5 }}>{formatQty(item.qty, item.unit)}</AppText>
                    <Pressable onPress={() => setQty(item.productId, Math.round((item.qty + step) * 2) / 2)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`+ ${item.name}`} style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                      <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16, lineHeight: 18 }}>+</AppText>
                    </Pressable>
                  </View>
                  <AppText variant="bodyBold" color={c.price} style={{ fontSize: 14 }}>₹{lineTotal(item)}</AppText>
                </View>
              </View>
            );
          })}

          <Pressable onPress={goHome} accessibilityRole="button" style={{ padding: 10, borderTopWidth: 1, borderTopColor: c.surface2, alignItems: "center" }}>
            <AppText variant="label" numberOfLines={1} style={{ fontSize: 13 }}>
              {t("addMoreTitle")} <AppText variant="label" color={c.price} style={{ fontSize: 13 }}>{t("addMoreItems")}</AppText>
            </AppText>
          </Pressable>
        </View>

        {/* Coupon + bill */}
        <BillSummary bill={bill} />
      </ScrollView>

      <GlassDock onHeight={setDockH}>
        <DeliverTo address={single} onChange={() => router.push("/checkout")} />
        <View style={{ gap: 6 }}>
          {error ? <AppText variant="caption" color={c.danger} numberOfLines={2} style={{ textAlign: "center", fontSize: 11.5 }}>{error}</AppText> : null}
          {single ? (
            <Button label={`${t("placeOrder")} · ₹ ${bill.toPay}`} onPress={placeNow} loading={place.isPending} disabled={bill.belowMin || !slot} />
          ) : (
            <Button label={t("selectAddress")} onPress={() => router.push("/checkout")} disabled={bill.belowMin} />
          )}
        </View>
      </GlassDock>
    </SafeAreaView>
  );
}
