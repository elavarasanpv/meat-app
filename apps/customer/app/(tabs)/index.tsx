import { useState } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { ProductCard } from "@/components/ProductCard";
import { ProductSheet } from "@/components/ProductSheet";
import { SearchHint } from "@/components/SearchHint";
import { SubcategoryCard } from "@/components/SubcategoryCard";
import { ErrorState, ProductGridSkeleton, Skeleton } from "@/components/States";
import { useCategories, useProducts, useSubcategories, type Subcategory } from "@/hooks/useCatalog";
import { categoryImage, productImage, subcategoryImage } from "@/lib/images";
import { useLocalName, useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { queryState } from "@/lib/network";

function greetingKey(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "greetingMorning" : h < 17 ? "greetingAfternoon" : "greetingEvening";
}

const GAP = 12;

/**
 * Price to show on a sub-category card: the "normal" cut (curry cut / with skin)
 * if there is one, otherwise the cheapest product inside.
 */
function headlinePrice(items: { name: string; base_price_per_kg: number }[]): number | undefined {
  if (items.length === 0) return undefined;
  const normal = items.find((p) => /curry cut|with skin/i.test(p.name) && !/skinless/i.test(p.name));
  const pick = normal ?? items.reduce((a, b) => (Number(b.base_price_per_kg) < Number(a.base_price_per_kg) ? b : a));
  return Number(pick.base_price_per_kg);
}

export default function HomeScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - 40 - GAP) / 2);
  const t = useT();
  const localName = useLocalName();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useCategories();
  const subcategories = useSubcategories();
  const products = useProducts(); // all products once; grouped below
  const pst = queryState(products);
  const cst = queryState(categories);
  const [openSub, setOpenSub] = useState<Subcategory | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // "All" → a section per category; a category → just that one. A section shows
  // sub-category cards when it has them (chicken), otherwise its products directly.
  const sections = (categories.data ?? [])
    .filter((cat) => categoryId === null || cat.id === categoryId)
    .map((cat) => ({
      id: cat.id,
      name: localName(cat),
      subs: (subcategories.data ?? []).filter((su) => su.category_id === cat.id),
      items: (products.data ?? []).filter((p) => p.category_id === cat.id),
    }))
    .filter((s) => s.subs.length > 0 || s.items.length > 0);

  const sheetProducts = openSub ? (products.data ?? []).filter((p) => p.subcategory_id === openSub.id) : [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      {/* No RefreshControl: on Android its SwipeRefreshLayout steals fast horizontal
          swipes from the nested product/category rows. Queries refetch on focus. */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
        stickyHeaderIndices={[1]}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          // header row is ~66px tall; past it the search bar is pinned → show shadow
          setScrolled((prev) => (y > 70 ? true : y < 60 ? false : prev));
        }}
      >
        {/* Header (scrolls away) */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                <Icon name="logo" color="#FFFFFF" size={22} />
              </View>
              <View style={{ flex: 1, height: 42, justifyContent: "center" }}>
                <AppText variant="subtitle" numberOfLines={1}>{t(greetingKey())}</AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 18 }}>
                  <Icon name="pin" color={c.primary} size={13} strokeWidth={2.4} />
                  <AppText variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>{t("deliverTo")}</AppText>
                  <Icon name="chevronDown" color={c.muted} size={13} strokeWidth={2.6} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <LangToggle />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="bell" color={c.ink} size={18} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Search bar — sticky (stickyHeaderIndices), gets a shadow once the page scrolls */}
        <View
          style={[
            { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: c.ground },
            scrolled && { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderBottomWidth: 1, borderBottomColor: c.border },
          ]}
        >
          <Pressable
            onPress={() => router.push("/search")}
            accessibilityRole="search"
            accessibilityLabel={t("searchPlaceholder")}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingLeft: 18, paddingRight: 7, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border }}
          >
            <Icon name="search" color={c.muted} size={20} />
            <SearchHint />
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Icon name="mic" color="#FFFFFF" size={18} />
            </View>
          </Pressable>
        </View>

        {/* Category bubbles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
          {cst.loading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ width: 78, height: 86, borderRadius: 18 }} />)
            : null}
          {[{ id: null as string | null, name: t("all") }, ...(categories.data ?? [])].map((cat) => {
            const selected = categoryId === cat.id;
            const img = categoryImage(cat.id === null ? null : cat.name);
            return (
              <Pressable
                key={cat.id ?? "all"}
                onPress={() => setCategoryId(cat.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ alignItems: "center", gap: 6, width: 78 }}
              >
                {/* Rounded rectangle: landscape cut-outs fit better than in a circle */}
                <View
                  style={{
                    width: 78,
                    height: 62,
                    borderRadius: 18,
                    borderWidth: 2,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.tint : c.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {img ? (
                    <Image source={img} resizeMode="contain" style={{ width: 66, height: 48 }} />
                  ) : (
                    <AppText variant="title" color={c.price} style={{ fontSize: 20 }}>{(cat.id === null ? cat.name : localName(cat as { name: string; name_ta: string | null })).charAt(0)}</AppText>
                  )}
                </View>
                <AppText variant="label" color={selected ? c.primary : c.ink} numberOfLines={1} style={{ height: 18 }}>
                  {cat.id === null ? cat.name : localName(cat as { name: string; name_ta: string | null })}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* AI suggestion */}
        <View style={{ marginHorizontal: 20, flexDirection: "row", gap: 12, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="sparkle" color={c.primary} size={22} />
          </View>
          <View style={{ flex: 1, gap: 2, height: 84, justifyContent: "center" }}>
            <AppText variant="label" color={c.price} numberOfLines={1} style={{ fontSize: 10, letterSpacing: 0.6, height: 16 }}>{t("aiLabel")}</AppText>
            <AppText variant="subtitle" numberOfLines={2} style={{ fontSize: 15, lineHeight: 21, height: 42 }}>{t("aiSuggestion")}</AppText>
            <AppText variant="caption" muted numberOfLines={1} style={{ height: 18 }}>₹ 1,260 · {t("aiMeta")}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 40, minWidth: 72, paddingHorizontal: 14, borderRadius: 20, backgroundColor: pressed ? c.primaryPressed : c.primary, justifyContent: "center", alignItems: "center" })}
          >
            <AppText variant="label" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13 }}>{t("order")}</AppText>
          </Pressable>
        </View>

        {/* Product sections: one row per category ("All") or just the chosen category */}
        {pst.loading || cst.loading ? (
          <View style={{ gap: 18 }}>
            <ProductGridSkeleton cardWidth={cardWidth} />
            <ProductGridSkeleton cardWidth={cardWidth} />
          </View>
        ) : pst.failed || cst.failed ? (
          <View style={{ paddingHorizontal: 20 }}>
            <ErrorState onRetry={() => { products.refetch(); categories.refetch(); subcategories.refetch(); }} />
          </View>
        ) : sections.length === 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <ErrorState icon="cart" title={t("noProducts")} message={categoryId ? t("noItems") : undefined} onRetry={() => products.refetch()} />
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, height: 28 }}>
                <AppText variant="title" numberOfLines={1}>{section.name}</AppText>
                <Pressable onPress={() => setCategoryId(section.id)} accessibilityRole="button">
                  <AppText variant="label" color={c.price} numberOfLines={1}>{t("seeAll")}</AppText>
                </Pressable>
              </View>
              {/* 2-up grid: sub-category cards when the category has them, else products */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: 20 }}>
                {section.subs.length > 0
                  ? section.subs.map((sub) => (
                      <SubcategoryCard
                        key={sub.id}
                        width={cardWidth}
                        name={localName(sub)}
                        count={(products.data ?? []).filter((p) => p.subcategory_id === sub.id).length}
                        price={headlinePrice((products.data ?? []).filter((p) => p.subcategory_id === sub.id))}
                        image={subcategoryImage(sub.name, sub.image_path)}
                        onPress={() => setOpenSub(sub)}
                      />
                    ))
                  : section.items.map((item) => (
                      <ProductCard
                        key={item.id}
                        width={cardWidth}
                        name={localName(item)}
                        pricePerKg={Number(item.base_price_per_kg)}
                        unit={item.unit}
                        image={productImage(item.name, item.image_path)}
                        onPress={() => router.push(`/product/${item.id}`)}
                        onAdd={() => router.push(`/product/${item.id}`)}
                      />
                    ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ProductSheet
        title={openSub ? localName(openSub) : null}
        products={sheetProducts}
        onClose={() => setOpenSub(null)}
        onAdd={(p) => {
          setOpenSub(null);
          router.push(`/product/${p.id}`);
        }}
      />
    </SafeAreaView>
  );
}
