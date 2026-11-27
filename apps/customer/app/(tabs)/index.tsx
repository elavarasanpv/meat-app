import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Animated, Easing, Image, Pressable, StyleSheet, ScrollView, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { LangToggle } from "@/components/LangToggle";
import { ProductCard } from "@/components/ProductCard";
import { ProductSheet } from "@/components/ProductSheet";
import { SearchHint } from "@/components/SearchHint";
import { SubcategoryCard } from "@/components/SubcategoryCard";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { ForYou } from "@/components/ForYou";
import { ShopClosedNote } from "@/components/ShopClosedNote";
const INGREDIENTS = require("@thanjozmart/assets/images/doodle-ingredients.webp");
const GROCERY_DOODLE = require("@thanjozmart/assets/images/doodle-grocery.webp");
import { offerTag, useOfferForProduct } from "@/hooks/useOffers";
import { ErrorState, ProductGridSkeleton, Skeleton } from "@/components/States";
import { byPopularity, useCategories, useProductStats, useProducts, useSubcategories, type Subcategory } from "@/hooks/useCatalog";
import { useSelectedAddress } from "@/hooks/useOrders";
import { useGroceryLive } from "@/hooks/useGrocery";
import { GroceryHome } from "@/components/GroceryHome";
import { VerticalStrip } from "@/components/VerticalStrip";
import { useVertical } from "@/store/vertical";
import { useCart } from "@/store/cart";
import { categoryImage, productImage, subcategoryImage } from "@/lib/images";
import { useLocalName, useT, type TKey } from "@/i18n";
import { Accent, radius, useTheme, withAccent } from "@/theme";
import { queryState } from "@/lib/network";
import { prefetchPhotos } from "@/lib/photo";

function greetingKey(): TKey {
  const h = new Date().getHours();
  return h < 12 ? "greetingMorning" : h < 17 ? "greetingAfternoon" : "greetingEvening";
}

const GAP = 12;
/** How long the header takes to turn from one section's colour to the other's. */
const SECTION_FADE_MS = 320;

/** Header backdrop: the meat wash with the grocery wash fading in over it, so a section switch never snaps. */
function HeaderWash({ mix }: { mix: Animated.Value }) {
  const { tone } = useTheme();
  return (
    <>
      <LinearGradient pointerEvents="none" colors={[...tone.header]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: mix }]}>
        <LinearGradient colors={[...tone.groceryHeader]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </>
  );
}

/** Soft white bubbles and the faint line drawing behind the header content: ingredients for meat, a basket for grocery. */
function HeaderDecor({ mix }: { mix: Animated.Value }) {
  const { glow } = useTheme();
  const doodle = { width: 250, height: 160, transform: [{ rotate: "-6deg" }] };
  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", right: -70, top: -40, width: 230, height: 230, borderRadius: 115, backgroundColor: glow(0.45) }} />
      <View pointerEvents="none" style={{ position: "absolute", left: -50, bottom: -90, width: 170, height: 170, borderRadius: 85, backgroundColor: glow(0.35) }} />
      <View pointerEvents="none" style={{ position: "absolute", right: -24, top: 6 }}>
        <Animated.Image source={INGREDIENTS} resizeMode="contain" style={[doodle, { opacity: mix.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0] }) }]} />
        <Animated.Image source={GROCERY_DOODLE} resizeMode="contain" style={[doodle, { position: "absolute", opacity: mix.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]} />
      </View>
    </>
  );
}

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
  const offerFor = useOfferForProduct();
  const router = useRouter();
  const { c, tone, glow, dark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - 40 - GAP) / 2);
  const t = useT();
  // The chosen delivery address (newest saved until one is picked). Tapping it opens its edit page.
  const address = useSelectedAddress();
  const hasCart = useCart((s) => s.items.length > 0);
  const addressLine = address ? `${address.label} · ${address.landmark || address.address_text}` : t("setAddress");
  const openAddress = () => router.push(address ? { pathname: "/address/new", params: { id: address.id } } : "/address/location");
  const localName = useLocalName();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useCategories();
  const subcategories = useSubcategories();
  const products = useProducts(); // all products once; grouped below
  // On Wi-Fi, fetch every product's big photo now so the product page opens with it already on the phone.
  useEffect(() => {
    if (products.data) prefetchPhotos(products.data.map((p) => (p.image_path ? productImage(p.name, p.image_path) : undefined)), 320);
  }, [products.data]);
  const stats = useProductStats(); // stars + how many customers bought each; most-bought first
  const groceryLive = useGroceryLive(); // false until admin switches the vertical on
  const vertical = useVertical((s) => s.vertical);
  const grocery = groceryLive && vertical === "grocery";
  // The header turns green for grocery; everything else keeps the brand orange.
  const header = grocery ? tone.groceryHeader : tone.header;
  const green = withAccent(c, "grocery", dark);
  const accent = grocery ? green.primary : c.primary;
  // A section switch cross-fades: the header wash and doodle (mix), the accent fills (tint) and the page below (body).
  const mix = useRef(new Animated.Value(grocery ? 1 : 0)).current;
  const tint = useRef(new Animated.Value(grocery ? 1 : 0)).current;
  const body = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const to = { toValue: grocery ? 1 : 0, duration: SECTION_FADE_MS, easing: Easing.inOut(Easing.quad) };
    body.setValue(0);
    Animated.parallel([
      Animated.timing(mix, { ...to, useNativeDriver: true }),
      Animated.timing(tint, { ...to, useNativeDriver: false }),
      Animated.timing(body, { toValue: 1, duration: SECTION_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [grocery]);
  const accentFill = tint.interpolate({ inputRange: [0, 1], outputRange: [c.primary, green.primary] });
  const pst = queryState(products);
  const cst = queryState(categories);
  const [openSub, setOpenSub] = useState<Subcategory | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const insets = useSafeAreaInsets();

  // "All" → a section per category; a category → just that one. A section shows
  // sub-category cards when it has them (chicken), otherwise its products directly.
  const sections = (categories.data ?? [])
    .filter((cat) => categoryId === null || cat.id === categoryId)
    .map((cat) => ({
      id: cat.id,
      name: localName(cat),
      // A sub-category card shows only when a shop near the customer lists something in it.
      subs: (subcategories.data ?? []).filter((su) => su.category_id === cat.id && (products.data ?? []).some((p) => p.subcategory_id === su.id)),
      items: byPopularity((products.data ?? []).filter((p) => p.category_id === cat.id), stats.data),
    }))
    .filter((s) => s.subs.length > 0 || s.items.length > 0);

  const sheetProducts = openSub ? byPopularity((products.data ?? []).filter((p) => p.subcategory_id === openSub.id), stats.data) : [];

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: header[0] }}>
      {/* No RefreshControl: on Android its SwipeRefreshLayout steals fast horizontal
          swipes from the nested product/category rows. Queries refetch on focus. */}
      <ScrollView
        style={{ backgroundColor: c.ground }}
        contentContainerStyle={{ paddingBottom: hasCart ? CART_BAR_SPACE : 24, gap: 8 }}
        stickyHeaderIndices={[1]}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          // greeting row is ~74px tall; past it the search block is pinned → add its shadow
          setScrolled((prev) => (y > insets.top + 74 ? true : y < insets.top + 64 ? false : prev));
        }}
      >
        {/* Header (scrolls away): brand-orange block with greeting, address and actions */}
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 6, marginBottom: -8, overflow: "hidden" }}>
          <HeaderWash mix={mix} />
          <HeaderDecor mix={mix} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Animated.View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: accentFill, alignItems: "center", justifyContent: "center" }}>
                <Logo bag="#FFFFFF" mark={accent} size={28} />
              </Animated.View>
              <View style={{ flex: 1, height: 44, justifyContent: "center" }}>
                <AppText variant="subtitle" numberOfLines={1}>{t(greetingKey())}</AppText>
                <Pressable onPress={openAddress} accessibilityRole="button" accessibilityLabel={t("editAddress")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 18 }}>
                  <Icon name="pin" color={accent} size={13} strokeWidth={2.4} />
                  <AppText variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>{addressLine}</AppText>
                  <Icon name="chevronDown" color={c.muted} size={13} strokeWidth={2.6} />
                </Pressable>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <LangToggle />
              <Pressable
                onPress={() => router.push("/profile")}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("profileOpen")}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="user" color={c.ink} size={19} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Search block — sticky (stickyHeaderIndices). Same orange as the header so it
            reads as part of it at rest, and as a compact header once pinned. */}
        <View style={[{ backgroundColor: c.ground, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }, scrolled && { shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 }]}>
          <View style={{ paddingHorizontal: 20, paddingTop: scrolled ? insets.top + 8 : 10, paddingBottom: groceryLive ? 12 : 16, gap: 10, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" }}>
            <HeaderWash mix={mix} />
            <View pointerEvents="none" style={{ position: "absolute", right: -40, top: -120, width: 220, height: 220, borderRadius: 110, backgroundColor: glow(0.35) }} />
            <Pressable
              onPress={() => router.push("/search")}
              accessibilityRole="search"
              accessibilityLabel={t("searchPlaceholder")}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingLeft: 18, paddingRight: 7, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: grocery ? "rgba(30,138,79,0.22)" : "rgba(228,70,31,0.18)" }}
            >
              <Icon name="search" color={c.muted} size={20} />
              <SearchHint />
              <Pressable
                onPress={() => router.push("/search?voice=1")}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("voiceSearch")}
                style={({ pressed }) => ({ borderRadius: 20, opacity: pressed ? 0.85 : 1 })}
              >
                <Animated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accentFill, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="mic" color="#FFFFFF" size={18} />
                </Animated.View>
              </Pressable>
            </Pressable>
            {/* Meat & fish / Grocery — part of the pinned header, as in the design */}
            {groceryLive && <VerticalStrip />}
          </View>
        </View>

        <Animated.View style={{ opacity: body }}>
        {grocery ? <Accent value="grocery"><GroceryHome pincode={address?.pincode} /></Accent> : <>
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

        <ShopClosedNote style={{ marginHorizontal: 20, marginBottom: 14 }} />

        <ForYou />

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
            <ErrorState icon="cart" title={t("noProducts")} message={categoryId ? t("noItems") : address ? t("meatNotHere") : undefined} onRetry={() => products.refetch()} />
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
                        offerTag={(() => {
                          const o = offerFor(item.id);
                          return o ? offerTag(o) : null;
                        })()}
                      />
                    ))}
              </View>
            </View>
          ))
        )}
        </>}
        </Animated.View>
      </ScrollView>

      <CartBar aboveTabBar />

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
