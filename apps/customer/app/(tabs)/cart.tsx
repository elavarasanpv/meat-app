import { Image, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyBasket } from "@/components/EmptyBasket";
const PATTERN = require("@freshcut/assets/images/pattern-doodles.png");
import { BillSummary, useBill } from "@/components/BillSummary";
import { useHomePincode } from "@/hooks/useOffers";
import { Icon } from "@/components/Icon";
import { productImage } from "@/lib/images";
import { FREE_DELIVERY_ABOVE, cartTotals, formatQty, lineTotal, qtyStep, useCart } from "@/store/cart";
import { useLocalName, useT } from "@/i18n";
import { radius, useTheme } from "@/theme";

export default function CartScreen() {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const bill = useBill(useHomePincode());
  const { toPay } = bill;
  const insets = useSafeAreaInsets();

  if (items.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        {/* faint FreshCut doodle frame around the empty state */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="contain" style={{ width: "100%", height: "100%", opacity: 0.3 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
          <EmptyBasket size={250} />
          <AppText variant="title" numberOfLines={1}>{t("cartEmpty")}</AppText>
          <AppText muted style={{ textAlign: "center", maxWidth: 280, marginTop: -6 }}>{t("cartEmptySub")}</AppText>
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
        <AppText variant="title" numberOfLines={1}>
          {t("tabCart")} · {items.length}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 10 }}>
        {items.map((item) => {
          const img = productImage(item.name, null);
          const step = qtyStep(item.unit);
          return (
            <View
              key={item.productId}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {img ? (
                  <Image source={img} resizeMode="contain" style={{ width: 50, height: 50 }} />
                ) : (
                  <AppText variant="title" color={c.price} style={{ fontSize: 18 }}>{item.name.charAt(0)}</AppText>
                )}
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{localName({ name: item.name, name_ta: item.nameTa })}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>
                  ₹ {item.price} {t(item.unit === "piece" ? "perPiece" : "perKg")}
                  {item.size ? ` · ${t(item.size === "small" ? "sizeSmall" : item.size === "medium" ? "sizeMedium" : "sizeLarge")}` : ""}
                </AppText>
                {item.notes ? (
                  <AppText variant="caption" muted numberOfLines={1} style={{ fontStyle: "italic" }}>“{item.notes}”</AppText>
                ) : null}
                <AppText variant="price" color={c.price} numberOfLines={1} style={{ fontSize: 15, lineHeight: 19 }}>₹ {lineTotal(item)}</AppText>
              </View>

              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", height: 36, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 3 }}>
                  <Pressable
                    onPress={() => setQty(item.productId, Math.round((item.qty - step) * 2) / 2)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("remove")} ${item.name}`}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}
                  >
                    <AppText variant="bodyBold" style={{ fontSize: 16 }}>−</AppText>
                  </Pressable>
                  <AppText variant="bodyBold" numberOfLines={1} style={{ minWidth: 52, textAlign: "center", fontSize: 12 }}>
                    {formatQty(item.qty, item.unit)}
                  </AppText>
                  <Pressable
                    onPress={() => setQty(item.productId, Math.round((item.qty + step) * 2) / 2)}
                    accessibilityRole="button"
                    accessibilityLabel={`+ ${item.name}`}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}
                  >
                    <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 16 }}>+</AppText>
                  </Pressable>
                </View>
                <Pressable onPress={() => remove(item.productId)} accessibilityRole="button">
                  <AppText variant="caption" color={c.danger} numberOfLines={1}>{t("remove")}</AppText>
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Back to Home to add more items */}
        <Button label={t("shopMore")} variant="outline" size="sm" icon="home" onPress={() => router.push("/(tabs)")} style={{ alignSelf: "flex-start" }} />

        {/* Bill summary with offers and coupon */}
        <BillSummary bill={bill} />
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label={`${t("placeOrder")} · ₹ ${toPay}`} onPress={() => router.push("/checkout")} />
      </View>
    </SafeAreaView>
  );
}
