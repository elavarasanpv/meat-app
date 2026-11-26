import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
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
/** Where the chip strip was left, so the next sub-category opens from there and glides to its own chip. */
let stripX = 0;

/**
 * One sub-category: its sibling tiles as chips across the top (hop between
 * "Atta, rice & dal" and "Oil, ghee & masala" without going back), then the
 * 2-up product cards. The cards sit in a FlashList, so a sub-category with
 * hundreds of items only builds the rows on screen and reuses them as the
 * customer scrolls.
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

  // Bring the selected chip to the middle of the strip, with a glide.
  const strip = useRef<ScrollView>(null);
  const spots = useRef(new Map<string, { x: number; w: number }>()).current;
  const [laid, setLaid] = useState(0);
  const centre = useCallback(() => {
    const spot = id ? spots.get(id) : undefined;
    if (!spot) return;
    strip.current?.scrollTo({ x: Math.max(0, spot.x + spot.w / 2 - width / 2), animated: true });
  }, [id, spots, width]);
  useEffect(() => {
    if (laid < siblings.length || siblings.length < 2) return;
    const h = setTimeout(centre, 80); // after the strip has taken its starting offset
    return () => clearTimeout(h);
  }, [laid, siblings.length, centre]);

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
          <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: stripX, y: 0 }} scrollEventThrottle={32} onScroll={(e) => { stripX = e.nativeEvent.contentOffset.x; }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }} style={{ flexGrow: 0 }}>
            {siblings.map((s) => {
              const on = s.id === id;
              return (
                <Pressable key={s.id} onPress={() => !on && router.replace(`/grocery/category/${s.id}`)} accessibilityRole="button" accessibilityState={{ selected: on }} onLayout={(e) => { const had = spots.has(s.id); spots.set(s.id, { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }); if (!had) setLaid(spots.size); }} style={{ height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.tint : c.surface, borderWidth: 1.5, borderColor: on ? c.primary : c.border, justifyContent: "center" }}>
                  <AppText variant="label" color={on ? c.primary : c.ink} numberOfLines={1}>{localName(s)}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {cs.loading || cs.failed || rows.length === 0 ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            {cs.loading ? (
              <ListSkeleton rows={4} height={cardWidth * 1.2} />
            ) : cs.failed ? (
              <ErrorState onRetry={() => catalog.refetch()} />
            ) : (
              <ErrorState icon="cart" title={t("noItems")} compact onRetry={() => catalog.refetch()} />
            )}
          </ScrollView>
        ) : (
          <FlashList
            data={rows}
            numColumns={2}
            keyExtractor={(r) => r.master_product_id}
            extraData={basket.items}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: basket.items.length ? CART_BAR_SPACE + 20 : 24 }}
            ItemSeparatorComponent={Gap}
            renderItem={({ item: r, index }) => (
              <View style={{ flex: 1, alignItems: index % 2 ? "flex-end" : "flex-start" }}>
                <GroceryCard item={r} width={cardWidth} qty={basket.qtyOf(r.master_product_id)} onAdd={() => basket.add(r)} onStep={(d) => basket.step(r, d)} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
              </View>
            )}
          />
        )}

        <CartBar />
        <BasketConfirm basket={basket} />
      </SafeAreaView>
    </Accent>
  );
}

const Gap = () => <View style={{ height: GAP }} />;
