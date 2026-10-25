import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ErrorState, Skeleton } from "@/components/States";
import { useAddresses, useDeleteAddress, usePlaceOrder, useSlots, type Slot } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { errorMessage, queryState } from "@/lib/network";
import { FREE_DELIVERY_ABOVE, cartTotals, useCart } from "@/store/cart";
import { radius, useTheme } from "@/theme";

type Payment = "cod" | "upi_on_delivery";

export default function CheckoutScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clearCart = useCart((s) => s.clear);
  const { itemTotal, delivery, toPay } = cartTotals(items);

  const addresses = useAddresses();
  const removeAddress = useDeleteAddress();
  const slots = useSlots();
  const place = usePlaceOrder();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [payment, setPayment] = useState<Payment>("cod");
  const [error, setError] = useState<string | null>(null);

  // Default to the newest address / first slot once loaded
  useEffect(() => {
    const list = addresses.data ?? [];
    if (list.length === 0) return setAddressId(null);
    if (!addressId || !list.some((a) => a.id === addressId)) setAddressId(list[0].id);
  }, [addresses.data]);

  function confirmDelete(id: string) {
    Alert.alert(t("deleteConfirm"), t("deleteSub"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: () => removeAddress.mutate(id) },
    ]);
  }
  useEffect(() => {
    if (!slot && slots.data?.length) setSlot(slots.data[0]);
  }, [slots.data]);

  const canPlace = items.length > 0 && !!addressId && !!slot && !place.isPending;

  async function placeOrder() {
    if (!addressId || !slot) return;
    setError(null);
    try {
      const result = await place.mutateAsync({
        addressId,
        slot: { startsAt: slot.startsAt, endsAt: slot.endsAt },
        paymentMode: payment,
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, size: i.size, notes: i.notes })),
      });
      clearCart();
      router.replace({ pathname: "/order/[id]", params: { id: result.orderId, placed: "1" } });
    } catch (e) {
      setError(`${t("orderFailed")} — ${errorMessage(e, t)}`);
    }
  }

  const card = { padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 10 } as const;
  const chip = (selected: boolean) => ({
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: selected ? c.primary : c.border,
    backgroundColor: selected ? c.tint : c.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });

  const byDay = (day: Slot["day"]) => (slots.data ?? []).filter((s) => s.day === day);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>
        <AppText variant="title" numberOfLines={1}>{t("checkout")}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {/* Address */}
        <View style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 28 }}>
            <AppText variant="subtitle" numberOfLines={1}>{t("deliverToLabel")}</AppText>
            <Pressable onPress={() => router.push("/address/new")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText variant="label" color={c.price} numberOfLines={1}>+ {t("addAddress")}</AppText>
            </Pressable>
          </View>
          {addresses.data?.length ? (
            addresses.data.map((a) => {
              const selected = a.id === addressId;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setAddressId(a.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{ flexDirection: "row", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tintSoft : c.surface }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? c.primary : c.border, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    {selected ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1}>{a.label} · {a.pincode}</AppText>
                    <AppText variant="caption" muted numberOfLines={2}>{a.address_text}{a.landmark ? ` · ${a.landmark}` : ""}</AppText>
                    {a.lat != null && a.lng != null ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Icon name="pin" color={c.successText} size={12} strokeWidth={2.6} />
                        <AppText variant="caption" color={c.successText} numberOfLines={1}>{t("locationSet")}</AppText>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => router.push({ pathname: "/address/location", params: { id: a.id } })}
                        accessibilityRole="button"
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" }}
                      >
                        <Icon name="pin" color={c.price} size={12} strokeWidth={2.6} />
                        <AppText variant="label" color={c.price} numberOfLines={1}>{t("setLocation")} · {t("locationMissing")}</AppText>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ gap: 6 }}>
                    <Pressable
                      onPress={() => router.push({ pathname: "/address/new", params: { id: a.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={t("editAddress")}
                      hitSlop={6}
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name="edit" color={c.ink} size={16} />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(a.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t("deleteAddress")}
                      hitSlop={6}
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name="trash" color={c.danger} size={16} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          ) : (
            queryState(addresses).loading ? (
              <Skeleton style={{ height: 70, borderRadius: 14 }} />
            ) : queryState(addresses).failed ? (
              <ErrorState compact onRetry={() => addresses.refetch()} />
            ) : (
              <AppText muted numberOfLines={2}>{t("noAddress")}</AppText>
            )
          )}
        </View>

        {/* Slot */}
        <View style={card}>
          <AppText variant="subtitle" numberOfLines={1} style={{ height: 24 }}>{t("deliverySlot")}</AppText>
          {queryState(slots).loading ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Skeleton style={{ width: 90, height: 46, borderRadius: 23 }} />
              <Skeleton style={{ width: 90, height: 46, borderRadius: 23 }} />
              <Skeleton style={{ width: 90, height: 46, borderRadius: 23 }} />
            </View>
          ) : queryState(slots).failed ? (
            <ErrorState compact onRetry={() => slots.refetch()} />
          ) : slots.data && slots.data.length === 0 ? (
            <AppText muted>{t("noSlots")}</AppText>
          ) : (
            (["today", "tomorrow"] as const).map((day) =>
              byDay(day).length ? (
                <View key={day} style={{ gap: 8 }}>
                  <AppText variant="label" muted numberOfLines={1}>{t(day)}</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {byDay(day).map((s) => {
                      const selected = slot?.startsAt === s.startsAt;
                      return (
                        <Pressable key={s.startsAt} onPress={() => setSlot(s)} accessibilityRole="button" style={chip(selected)}>
                          <AppText variant="bodyBold" color={selected ? c.price : c.ink} numberOfLines={1} style={{ fontSize: 13 }}>{s.label}</AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null,
            )
          )}
        </View>

        {/* Payment */}
        <View style={card}>
          <AppText variant="subtitle" numberOfLines={1} style={{ height: 24 }}>{t("payment")}</AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                ["cod", "payCod"],
                ["upi_on_delivery", "payUpi"],
              ] as const
            ).map(([mode, key]) => (
              <Pressable key={mode} onPress={() => setPayment(mode)} accessibilityRole="button" style={[chip(payment === mode), { flex: 1 }]}>
                <AppText variant="bodyBold" color={payment === mode ? c.price : c.ink} numberOfLines={1} style={{ fontSize: 13 }}>{t(key)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Bill */}
        <View style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <AppText variant="caption" muted>{t("itemTotal")} · {t("itemsCount", { n: items.length })}</AppText>
            <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {itemTotal}</AppText>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <AppText variant="caption" muted>{t("deliveryFee")}</AppText>
            {delivery === 0 ? (
              <AppText variant="caption" color={c.successText}>{t("freeAbove", { n: FREE_DELIVERY_ABOVE })}</AppText>
            ) : (
              <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {delivery}</AppText>
            )}
          </View>
          <View style={{ height: 1, backgroundColor: c.border }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="bodyBold">{t("toPay")}</AppText>
            <AppText variant="price" color={c.price} style={{ fontSize: 20, lineHeight: 25 }}>₹ {toPay}</AppText>
          </View>
          <AppText variant="caption" muted numberOfLines={2} style={{ lineHeight: 16 }}>{t("weightNote")}</AppText>
        </View>

        <AppText variant="caption" color={c.danger} numberOfLines={3} style={{ minHeight: 18 }}>{error ?? ""}</AppText>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label={`${t("placeOrder")} · ₹ ${toPay}`} onPress={placeOrder} disabled={!canPlace} loading={place.isPending} />
      </View>
    </SafeAreaView>
  );
}
