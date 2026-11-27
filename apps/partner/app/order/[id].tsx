import { Image, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { OrderCard, clock } from "@/components/OrderCard";
import { useDealerMe, useDealerOrders, type DealerOrderItem } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { productImage } from "@/lib/images";
import { Btn, Txt, useC } from "@/ui";

/** One line of the order: picture, full name, pack, quantity and the shop's amount. */
function Line({ it }: { it: DealerOrderItem }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const p = it.products;
  const name = lang === "ta" && p.name_ta ? p.name_ta : p.name;
  const img = productImage(p.name, p.image_path ?? null);
  const qty = p.unit === "kg" ? `${it.requested_kg} ${t("kg")}` : `${Math.round(it.requested_kg)} ${t("pieces")}`;
  const amount = Math.round(it.shop_price_per_kg * it.requested_kg);
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 12, opacity: it.unavailable ? 0.55 : 1 }}>
      <View style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {img ? <Image source={img} resizeMode="contain" style={{ width: 64, height: 64 }} /> : <Icon name="box" color={c.muted} size={28} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt bold size={16}>{name}</Txt>
        {p.brand ? <Txt size={13} muted>{p.brand}</Txt> : null}
        {/* The pack is what tells a 5 kg bag from a 10 kg bag of the same brand. */}
        {p.pack_size ? <Txt bold size={15}>{t("pack")}: {p.pack_size}</Txt> : null}
        {it.size ? <Txt size={13} muted>{t(`size_${it.size}` as TKey)}</Txt> : null}
        {it.notes ? <Txt size={13} color={c.info}>{t("customerNote")}: {it.notes}</Txt> : null}
        {it.unavailable ? <Txt bold size={13} color={c.danger}>{t("notAvailableItem")}</Txt> : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: c.tint }}>
            <Txt bold size={16} color={c.primary}>{qty}</Txt>
          </View>
          <Txt bold size={16}>₹{amount}</Txt>
        </View>
      </View>
    </View>
  );
}

/** Full-page view of one open order: every item with its picture and quantity, then the order's actions. */
export default function OrderDetails() {
  const c = useC();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useDealerMe();
  const orders = useDealerOrders(me.data?.id);
  const o = orders.data?.find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: c.ground }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("back")} hitSlop={8} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chevronLeft" color={c.ink} size={24} strokeWidth={2.4} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Txt bold size={20}>{t("orderDetails")}</Txt>
            {o ? (
              <Txt size={13} muted>
                {o.display_id}
                {o.delivery_slots ? ` · ${clock(o.delivery_slots.starts_at)}–${clock(o.delivery_slots.ends_at)}` : ""}
              </Txt>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {o ? (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Txt bold size={15} muted>{o.order_items.length} {t(o.order_items.length === 1 ? "item" : "items")}</Txt>
            <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {o.order_items.map((it, i) => (
                <View key={it.id}>
                  {i > 0 ? <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 12 }} /> : null}
                  <Line it={it} />
                </View>
              ))}
            </View>
          </ScrollView>
          {/* The order's actions stay on screen; only the item list scrolls. */}
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.ground }}>
            <OrderCard o={o} compact noDetails />
          </View>
        </>
      ) : orders.isLoading ? null : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <Icon name="check" color={c.muted} size={32} />
          <Txt bold size={17} style={{ textAlign: "center" }}>{t("orderGone")}</Txt>
          <Btn label={t("back")} kind="soft" onPress={back} />
        </View>
      )}
    </View>
  );
}
