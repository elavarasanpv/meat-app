import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { BasketConfirm } from "@/components/GroceryHome";
import { Icon } from "@/components/Icon";
import { ErrorState, ListSkeleton } from "@/components/States";
import { useGroceryBought, useGroceryCatalog, type GroceryItem } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { useHomePincode } from "@/hooks/useOffers";
import { useLocalName, useT } from "@/i18n";
import { groceryThumb } from "@/lib/images";
import { Accent, radius, useTheme, withAccent } from "@/theme";

/** Everything this customer has bought before, as a searchable list with + / stepper per row. */
export default function BoughtBeforeScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery", theme.dark);
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const pincode = useHomePincode();
  const catalog = useGroceryCatalog(pincode);
  const bought = useGroceryBought();
  const basket = useGroceryBasket(pincode);
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map((catalog.data ?? []).map((r) => [r.master_product_id, r])), [catalog.data]);
  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => (bought.data ?? []).map((id) => byId.get(id)).filter((r): r is GroceryItem => !!r).filter((r) => !needle || [r.name, r.name_ta, r.brand].some((s) => s?.toLowerCase().includes(needle))), [bought.data, byId, needle]);

  return (
    <Accent value="grocery">
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 52 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Icon name="back" color={c.ink} size={18} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>{t("boughtBefore")}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{t("itemsCount", { n: (bought.data ?? []).length })}</AppText>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Icon name="search" color={c.muted} size={18} />
            <TextInput value={q} onChangeText={setQ} placeholder={t("searchGrocery")} placeholderTextColor={c.muted} style={{ flex: 1, color: c.ink, fontSize: 14, paddingVertical: 0 }} />
            {q ? <Pressable onPress={() => setQ("")} hitSlop={8} accessibilityRole="button"><Icon name="close" color={c.muted} size={16} /></Pressable> : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: basket.items.length ? CART_BAR_SPACE + 20 : 24 }}>
          {bought.isLoading || catalog.isLoading ? (
            <ListSkeleton rows={6} height={84} />
          ) : rows.length === 0 ? (
            <ErrorState icon="cart" title={t("noItems")} compact />
          ) : (
            rows.map((r) => {
              const img = groceryThumb(r.image_path);
              const qty = basket.qtyOf(r.master_product_id);
              const off = r.mrp && r.mrp > r.selling_price ? Math.round(((r.mrp - r.selling_price) / r.mrp) * 100) : 0;
              return (
                <Pressable key={r.master_product_id} onPress={() => router.push(`/grocery/item/${r.master_product_id}`)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: r.in_stock ? 1 : 0.55 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {img ? <Image source={img} resizeMode="contain" style={{ width: 58, height: 58 }} /> : <AppText variant="title" color={c.primary}>{r.name.charAt(0)}</AppText>}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>{localName(r)}</AppText>
                    <AppText variant="caption" muted numberOfLines={1}>{[r.brand, r.pack_size ?? (r.unit === "kg" ? `/ ${t("unitKg")}` : null)].filter(Boolean).join(" · ")}</AppText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <AppText variant="price" color={c.ink} style={{ fontSize: 15 }}>₹ {r.selling_price}</AppText>
                      {off > 0 && (<><AppText variant="caption" muted style={{ textDecorationLine: "line-through" }}>₹ {r.mrp}</AppText><AppText variant="caption" color={c.primary}>{t("percentOff", { n: off })}</AppText></>)}
                    </View>
                  </View>
                  {!r.in_stock ? (
                    <AppText variant="label" muted numberOfLines={1}>{t("outOfStock")}</AppText>
                  ) : qty > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.pill, backgroundColor: c.primary, height: 36 }}>
                      <Pressable onPress={() => basket.step(r, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Less" style={{ width: 34, height: 36, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 20 }}>−</AppText></Pressable>
                      <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13, minWidth: 40, textAlign: "center" }}>{r.unit === "kg" ? `${qty} ${t("unitKg")}` : qty}</AppText>
                      <Pressable onPress={() => basket.step(r, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="More" style={{ width: 34, height: 36, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 20 }}>+</AppText></Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => basket.add(r)} accessibilityRole="button" accessibilityLabel={t("add")} style={({ pressed }) => ({ height: 36, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.primary, backgroundColor: pressed ? c.tint : c.surface, alignItems: "center", justifyContent: "center" })}>
                      <AppText variant="label" color={c.primary}>{t("add")}</AppText>
                    </Pressable>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <CartBar />
        <BasketConfirm basket={basket} />
      </SafeAreaView>
    </Accent>
  );
}
