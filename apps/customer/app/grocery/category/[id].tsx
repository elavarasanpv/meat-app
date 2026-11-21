import { useMemo } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { BasketConfirm, GroceryCard } from "@/components/GroceryHome";
import { Icon } from "@/components/Icon";
import { ErrorState, ListSkeleton } from "@/components/States";
import { useGroceryCatalog, useGroceryCategories } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { useHomePincode } from "@/hooks/useOffers";
import { useLocalName, useT } from "@/i18n";
import { queryState } from "@/lib/network";
import { Accent, radius, useTheme, withAccent } from "@/theme";

const GAP = 12;

/**
 * One sub-category: its sibling tiles as chips across the top (hop between
 * "Atta, rice & dal" and "Oil, ghee & masala" without going back), then the
 * 2-up product cards.
 */
export default function GroceryCategoryScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery", theme.dark);
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - GAP) / 2);
  const { id } = useLocalSearchParams<{ id: string }>();
  const pincode = useHomePincode();
  const cats = useGroceryCategories();
  const catalog = useGroceryCatalog(pincode);
  const basket = useGroceryBasket(pincode);
  const cs = queryState(catalog);

  const me = cats.data?.find((x) => x.id === id);
  const group = me?.parent_id ? cats.data?.find((x) => x.id === me.parent_id) : undefined;
  const siblings = useMemo(() => (cats.data ?? []).filter((x) => x.parent_id === (me?.parent_id ?? null) && !!x.parent_id), [cats.data, me?.parent_id]);
  const rows = useMemo(() => (catalog.data ?? []).filter((r) => r.category_id === id), [catalog.data, id]);

  return (
    <Accent value="grocery">
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 52 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Icon name="back" color={c.ink} size={18} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>{me ? localName(me) : ""}</AppText>
            {group ? <AppText variant="caption" muted numberOfLines={1}>{localName(group)}</AppText> : null}
          </View>
        </View>

        {siblings.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }} style={{ flexGrow: 0 }}>
            {siblings.map((s) => {
              const on = s.id === id;
              return (
                <Pressable key={s.id} onPress={() => !on && router.replace(`/grocery/category/${s.id}`)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.tint : c.surface, borderWidth: 1.5, borderColor: on ? c.primary : c.border, justifyContent: "center" }}>
                  <AppText variant="label" color={on ? c.primary : c.ink} numberOfLines={1}>{localName(s)}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: basket.items.length ? CART_BAR_SPACE + 20 : 24 }}>
          {cs.loading ? (
            <ListSkeleton rows={4} height={cardWidth * 1.2} />
          ) : cs.failed ? (
            <ErrorState onRetry={() => catalog.refetch()} />
          ) : rows.length === 0 ? (
            <ErrorState icon="cart" title={t("noItems")} compact onRetry={() => catalog.refetch()} />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
              {rows.map((r) => (
                <GroceryCard key={r.master_product_id} item={r} width={cardWidth} qty={basket.qtyOf(r.master_product_id)} onAdd={() => basket.add(r)} onStep={(d) => basket.step(r, d)} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
              ))}
            </View>
          )}
        </ScrollView>

        <CartBar />
        <BasketConfirm basket={basket} />
      </SafeAreaView>
    </Accent>
  );
}
