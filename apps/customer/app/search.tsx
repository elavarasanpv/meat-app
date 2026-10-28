import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { Icon } from "@/components/Icon";
import { ErrorState, ListSkeleton } from "@/components/States";
import { SearchHint } from "@/components/SearchHint";
import { useCategories, useProducts, useSubcategories, type Product } from "@/hooks/useCatalog";
import { productImage } from "@/lib/images";
import { buildTargets, searchProducts, type SearchResult } from "@/lib/search";
import { useLocalName, useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";
import { queryState } from "@/lib/network";
import { useCart } from "@/store/cart";

function Row({ product, onPress }: { product: Product; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const img = productImage(product.name, product.image_path);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: pressed ? c.tintSoft : c.surface, borderWidth: 1, borderColor: c.border })}
    >
      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {img ? <Image source={img} resizeMode="contain" style={{ width: 50, height: 50 }} /> : <AppText variant="title" color={c.price}>{product.name.charAt(0)}</AppText>}
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>{localName(product)}</AppText>
        <AppText variant="caption" muted numberOfLines={1}>₹ {Number(product.base_price_per_kg)} {t(product.unit === "piece" ? "perPiece" : "perKg")}</AppText>
      </View>
      <Icon name="back" color={c.muted} size={18} strokeWidth={2.4} />
    </Pressable>
  );
}

export default function SearchScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const products = useProducts();
  const categories = useCategories();
  const subcategories = useSubcategories();
  const [query, setQuery] = useState("");
  const hasCart = useCart((s) => s.items.length > 0);

  const targets = useMemo(
    () => buildTargets(products.data ?? [], categories.data ?? [], subcategories.data ?? []),
    [products.data, categories.data, subcategories.data],
  );
  const { strong, close } = useMemo(() => searchProducts(targets, query), [targets, query]);

  const open = (r: SearchResult) => router.push(`/product/${r.product.id}`);
  const empty = query.trim().length === 0;
  // No query yet: the whole catalog, so people can just scroll and tap.
  const defaultList: SearchResult[] = empty ? (products.data ?? []).map((p) => ({ product: p, score: 1 })) : [];
  const showEmpty = !empty && strong.length === 0 && close.length === 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      {/* Search header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.primary }}>
          <Icon name="search" color={c.muted} size={20} />
          {query.length === 0 ? (
            <View style={{ position: "absolute", left: 46, right: 44, top: 0, bottom: 0, justifyContent: "center" }} pointerEvents="none">
              <SearchHint />
            </View>
          ) : null}
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            placeholderTextColor={c.muted}
            style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink }}
            accessibilityLabel={t("searchPlaceholder")}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t("close")}>
              <AppText variant="bodyBold" muted style={{ fontSize: 16 }}>✕</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: hasCart ? CART_BAR_SPACE : 20, gap: 10 }} keyboardShouldPersistTaps="handled">
        {empty ? (
          <AppText variant="caption" muted numberOfLines={2}>{t("searchHint")}</AppText>
        ) : null}
        {queryState(products).loading ? <ListSkeleton rows={6} height={78} /> : null}
        {queryState(products).failed ? <ErrorState onRetry={() => products.refetch()} /> : null}

        {[...defaultList, ...strong].map((r) => (
          <Row key={r.product.id} product={r.product} onPress={() => open(r)} />
        ))}

        {close.length > 0 ? (
          <>
            <AppText variant="label" muted numberOfLines={1} style={{ marginTop: strong.length ? 8 : 0 }}>
              {t("didYouMean")}
            </AppText>
            {close.map((r) => (
              <Row key={r.product.id} product={r.product} onPress={() => open(r)} />
            ))}
          </>
        ) : null}

        {showEmpty ? <AppText muted>{t("noResults", { q: query.trim() })}</AppText> : null}
      </ScrollView>

      <CartBar />
    </SafeAreaView>
  );
}
