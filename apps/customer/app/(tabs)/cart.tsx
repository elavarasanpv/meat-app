import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { productImage } from "@/lib/images";
import { FREE_DELIVERY_ABOVE, cartTotals, formatQty, lineTotal, qtyStep, useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { radius, useTheme } from "@/theme";

export default function CartScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const { itemTotal, delivery, toPay } = cartTotals(items);

  if (items.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="cart" color={c.primary} size={32} />
          </View>
          <AppText variant="title" numberOfLines={1}>{t("cartEmpty")}</AppText>
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
                <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{item.name}</AppText>
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

        {/* Bill summary */}
        <View style={{ marginTop: 6, padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <AppText variant="caption" muted>{t("itemTotal")}</AppText>
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
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label={`${t("placeOrder")} · ₹ ${toPay}`} onPress={() => Alert.alert("FreshCut", t("checkoutSoon"))} />
      </View>
    </SafeAreaView>
  );
}
