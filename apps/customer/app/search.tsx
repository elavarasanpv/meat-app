import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { BasketConfirm, GroceryCard, MiniCard } from "@/components/GroceryHome";
import { Icon, type IconName } from "@/components/Icon";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { SearchHint } from "@/components/SearchHint";
import { ErrorState, ListSkeleton } from "@/components/States";
import { VoiceSheet } from "@/components/VoiceSheet";
import { byPopularity, useCategories, useProductStats, useProducts, useSubcategories, type Product } from "@/hooks/useCatalog";
import { useGroceryBought, useGroceryCatalog, useGroceryCategories, type GroceryItem } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { offerTag, useHomePincode, useOfferForProduct } from "@/hooks/useOffers";
import { useLocalName, useT } from "@/i18n";
import { categoryImage, groceryThumb, productImage } from "@/lib/images";
import { queryState } from "@/lib/network";
import { buildGroceryIndex, searchGrocery, type BrandGroup, type Phrase } from "@/lib/grocerySearch";
import { buildTargets, searchProducts } from "@/lib/search";
import { toQuery } from "@/lib/voice";
import { type Vertical, useCart } from "@/store/cart";
import { useRecentSearches } from "@/store/recent";
import { useVertical } from "@/store/vertical";
import { Accent, fonts, radius, useTheme } from "@/theme";

const GAP = 12;
/** Most cards a result grid builds; a one-letter query on a big catalog would otherwise draw hundreds. */
const MAX_RESULTS = 60;

/**
 * Search belongs to the section the customer came from: Meat & fish searches the meat
 * catalog, Grocery the grocery one, each in its own colour. Before anything is typed the
 * page offers recent searches, popular words, categories to browse and a few products;
 * results come back as the same cards the rest of the section uses.
 */
export default function SearchScreen() {
  // Fixed for this visit: adding a product must not swap the page to the other section.
  const [vertical] = useState(() => useVertical.getState().vertical);
  return <Accent value={vertical}>{vertical === "grocery" ? <GrocerySearch /> : <MeatSearch />}</Accent>;
}

function MeatSearch() {
  const t = useT();
  const router = useRouter();
  const localName = useLocalName();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - GAP) / 2);
  const products = useProducts();
  const categories = useCategories();
  const subcategories = useSubcategories();
  const stats = useProductStats();
  const offerFor = useOfferForProduct();
  const remember = useRecentSearches((s) => s.add);
  const [query, setQuery] = useState("");

  const targets = useMemo(
    () => buildTargets(products.data ?? [], categories.data ?? [], subcategories.data ?? []),
    [products.data, categories.data, subcategories.data],
  );
  const { strong, close } = useMemo(() => searchProducts(targets, query), [targets, query]);
  const popular = useMemo(() => byPopularity(products.data ?? [], stats.data).slice(0, 6), [products.data, stats.data]);
  const browse = useMemo(
    () =>
      (categories.data ?? [])
        .map((cat) => ({ id: cat.id, label: localName(cat), image: categoryImage(cat.name), count: (products.data ?? []).filter((p) => p.category_id === cat.id).length }))
        .filter((b) => b.count > 0),
    [categories.data, products.data, localName],
  );

  const card = (p: Product) => {
    const open = () => {
      remember("meat", query);
      router.push(`/product/${p.id}`);
    };
    const offer = offerFor(p.id);
    return (
      <ProductCard
        key={p.id}
        width={cardWidth}
        name={localName(p)}
        pricePerKg={Number(p.base_price_per_kg)}
        wasPrice={p.was_price}
        unit={p.unit}
        image={productImage(p.name, p.image_path)}
        onPress={open}
        onAdd={open}
        offerTag={offer ? offerTag(offer) : null}
      />
    );
  };
  const qs = queryState(products);

  return (
    <Frame vertical="meat" query={query} setQuery={setQuery}>
      {qs.loading ? <Pad><ListSkeleton rows={2} height={cardWidth * 1.3} /></Pad> : null}
      {qs.failed ? <Pad><ErrorState onRetry={() => products.refetch()} /></Pad> : null}

      {query.trim().length === 0 ? (
        <>
          <Browse title={t("srBrowse")} tiles={browse} onPick={(b) => setQuery(b.label)} />
          {popular.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Heading title={t("popular")} />
              <Grid>{popular.map(card)}</Grid>
            </View>
          ) : null}
        </>
      ) : (
        <Results query={query} strong={strong.length} close={close.length} ready={!qs.loading && !qs.failed}>
          {strong.length > 0 ? <Grid>{strong.slice(0, MAX_RESULTS).map((r) => card(r.product))}</Grid> : null}
          {close.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Heading title={t("didYouMean")} />
              <Grid>{close.map((r) => card(r.product))}</Grid>
            </View>
          ) : null}
        </Results>
      )}
    </Frame>
  );
}

function GrocerySearch() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const localName = useLocalName();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - GAP) / 2);
  const pincode = useHomePincode();
  const catalog = useGroceryCatalog(pincode);
  const cats = useGroceryCategories();
  const bought = useGroceryBought();
  const basket = useGroceryBasket(pincode);
  const remember = useRecentSearches((s) => s.add);
  const [query, setQuery] = useState("");

  const items = catalog.data ?? [];
  const index = useMemo(() => buildGroceryIndex(catalog.data ?? [], cats.data ?? []), [catalog.data, cats.data]);
  const found = useMemo(() => searchGrocery(index, query), [index, query]);
  // The brand chip belongs to the words it was picked under; new words start from "All" again.
  const [pick, setPick] = useState<{ query: string; brand: string } | null>(null);
  const brand = pick && pick.query === query ? pick.brand : null;
  const narrowable = !found.brandQuery && found.brands.length > 1;
  const shown = useMemo(
    () => (brand && narrowable ? found.results.filter((r) => r.brand?.trim().toLowerCase() === brand.toLowerCase()) : found.results).slice(0, MAX_RESULTS),
    [found.results, brand, narrowable],
  );
  // A brand was typed ("tata"): lay its products out brand by brand, or shelf by shelf when it is one brand.
  const groups = useMemo(() => {
    if (!found.brandQuery) return null;
    const byBrand = found.brands.length > 1;
    const out = new Map<string, { key: string; label: string; rows: GroceryItem[] }>();
    for (const r of shown) {
      const cat = byBrand ? undefined : (cats.data ?? []).find((x) => x.id === r.category_id);
      const label = byBrand ? (r.brand?.trim() ?? "") : cat ? localName(cat) : "";
      const key = label.toLowerCase();
      const g = out.get(key);
      if (g) g.rows.push(r);
      else out.set(key, { key, label, rows: [r] });
    }
    return out.size > 1 ? [...out.values()] : null;
  }, [found.brandQuery, found.brands.length, shown, cats.data, localName]);

  const boughtItems = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((r) => [r.master_product_id, r]));
    return (bought.data ?? []).map((id) => byId.get(id)).filter((r): r is GroceryItem => !!r).slice(0, 10);
  }, [bought.data, catalog.data]);
  const deals = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((r) => r.in_stock && r.mrp != null && r.mrp > r.selling_price)
        .sort((a, b) => (b.mrp! - b.selling_price) / b.mrp! - (a.mrp! - a.selling_price) / a.mrp!)
        .slice(0, 6),
    [catalog.data],
  );
  const browse = useMemo(
    () =>
      (cats.data ?? [])
        .filter((x) => !!x.parent_id)
        .map((x) => ({ id: x.id, label: localName(x), image: groceryThumb(x.image_path), count: (catalog.data ?? []).filter((r) => r.category_id === x.id).length }))
        .filter((b) => b.count > 0)
        .slice(0, 14),
    [cats.data, catalog.data, localName],
  );

  const props = (r: GroceryItem) => ({
    item: r,
    qty: basket.qtyOf(r.master_product_id),
    onAdd: () => {
      remember("grocery", query);
      basket.add(r);
    },
    onStep: (d: 1 | -1) => basket.step(r, d),
    onOpen: () => {
      remember("grocery", query);
      router.push(`/grocery/item/${r.master_product_id}`);
    },
  });
  const card = (r: GroceryItem) => <GroceryCard key={r.master_product_id} width={cardWidth} {...props(r)} />;
  const cs = queryState(catalog);

  return (
    <Frame vertical="grocery" query={query} setQuery={setQuery} after={<BasketConfirm basket={basket} />}>
      {cs.loading ? <Pad><ListSkeleton rows={2} height={cardWidth * 1.2} /></Pad> : null}
      {cs.failed ? <Pad><ErrorState onRetry={() => catalog.refetch()} /></Pad> : null}

      {query.trim().length === 0 ? (
        <>
          <Browse title={t("srBrowse")} tiles={browse} onPick={(b) => router.push(`/grocery/category/${b.id}`)} />
          {boughtItems.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Heading title={t("boughtBefore")} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 6 }}>
                {boughtItems.map((r) => <MiniCard key={r.master_product_id} width={136} {...props(r)} />)}
              </ScrollView>
            </View>
          ) : null}
          {deals.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Heading title={t("srDeals")} icon="tag" color={c.primary} />
              <Grid>{deals.map(card)}</Grid>
            </View>
          ) : null}
        </>
      ) : (
        <Results query={query} strong={shown.length} close={found.shelves.length} ready={!cs.loading && !cs.failed && items.length > 0}>
          {found.corrected ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.tint }}>
              <Icon name="sparkle" color={c.primary} size={14} />
              <AppText variant="caption" color={c.primary} style={{ flexShrink: 1 }}>{t("srShowing", { q: found.corrected })}</AppText>
            </View>
          ) : null}
          {found.phrases.length > 0 ? <PhraseRail phrases={found.phrases} onPick={setQuery} /> : null}
          {narrowable ? <BrandRail brands={found.brands} total={found.results.length} active={brand} onPick={(b) => setPick(b ? { query, brand: b } : null)} /> : null}
          {groups ? (
            groups.map((g) => (
              <View key={g.key} style={{ gap: 12 }}>
                <GroupHead label={g.label} count={g.rows.length} />
                <Grid>{g.rows.map(card)}</Grid>
              </View>
            ))
          ) : shown.length > 0 ? (
            <Grid>{shown.map(card)}</Grid>
          ) : null}
          {found.shelves.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Heading title={t("srShelf")} />
              {found.shelves.slice(0, 3).map(({ cat, count }) => (
                <ShelfRow key={cat.id} label={localName(cat)} image={groceryThumb(cat.image_path)} count={count} onPress={() => router.push(`/grocery/category/${cat.id}`)} />
              ))}
            </View>
          ) : null}
        </Results>
      )}
    </Frame>
  );
}

/** "Toor Dal", "Moong Dal": ways to say it more exactly, read off the packs that matched. The typed word is plain, the rest bold. */
function PhraseRail({ phrases, onPick }: { phrases: Phrase<GroceryItem>[]; onPick: (q: string) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {phrases.map((p) => {
        const text = [p.before, p.word, p.after].filter(Boolean).join(" ");
        const img = groceryThumb(p.item.image_path);
        return (
          <Pressable
            key={p.key}
            onPress={() => onPick(text)}
            accessibilityRole="button"
            accessibilityLabel={text}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, height: 48, paddingLeft: 5, paddingRight: 14, borderRadius: 24, backgroundColor: pressed ? c.tint : c.surface, borderWidth: 1, borderColor: c.border })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {img ? <Photo source={img} width={38} style={{ width: 30, height: 30 }} /> : <Icon name="search" color={c.primary} size={16} />}
            </View>
            <AppText variant="body" style={{ fontSize: 14 }}>
              {p.before ? <AppText variant="bodyBold" style={{ fontSize: 14 }}>{p.before} </AppText> : null}
              {p.word}
              {p.after ? <AppText variant="bodyBold" style={{ fontSize: 14 }}> {p.after}</AppText> : null}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The brands among the results, each with how many it has; picking one keeps only that brand. */
function BrandRail({ brands, total, active, onPick }: { brands: BrandGroup<GroceryItem>[]; total: number; active: string | null; onPick: (brand: string | null) => void }) {
  const { c } = useTheme();
  const t = useT();
  const chip = (key: string, label: string, count: number, on: boolean, press: () => void, item?: GroceryItem) => {
    const img = item ? groceryThumb(item.image_path) : undefined;
    return (
      <Pressable
        key={key}
        onPress={press}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}, ${count}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingLeft: item ? 5 : 14, paddingRight: 6, borderRadius: 20, backgroundColor: on ? c.tint : c.surface, borderWidth: 1.5, borderColor: on ? c.primary : c.border }}
      >
        {item ? (
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? c.surface : c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {img ? <Photo source={img} width={30} style={{ width: 24, height: 24 }} /> : <AppText variant="label" color={c.primary}>{label.charAt(0).toUpperCase()}</AppText>}
          </View>
        ) : null}
        <AppText variant="label" color={on ? c.primary : c.ink} style={{ fontSize: 13 }}>{label}</AppText>
        <View style={{ minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: on ? c.primary : c.tintSoft, alignItems: "center", justifyContent: "center" }}>
          <AppText variant="caption" color={on ? "#FFFFFF" : c.muted} style={{ fontSize: 11.5 }}>{count}</AppText>
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label" muted style={{ paddingHorizontal: 20 }}>{t("srBrands")}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {chip("*", t("srAll"), total, active === null, () => onPick(null))}
        {brands.map((b) => {
          const on = active?.toLowerCase() === b.brand.toLowerCase();
          return chip(b.brand, b.brand, b.count, on, () => onPick(on ? null : b.brand), b.item);
        })}
      </ScrollView>
    </View>
  );
}

/** Heads one brand's (or one shelf's) cards when the results are laid out in groups. */
function GroupHead({ label, count }: { label: string; count: number }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <AppText variant="bodyBold" color={c.primary}>{(label || "?").charAt(0).toUpperCase()}</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="title" style={{ fontSize: 16, lineHeight: 21 }}>{label || t("srAll")}</AppText>
        <AppText variant="caption" muted>{count === 1 ? t("srCountOne") : t("srCount", { n: count })}</AppText>
      </View>
    </View>
  );
}

/** The shelf the words belong to ("Atta, rice & dal"): one tap opens everything on it. */
function ShelfRow({ label, image, count, onPress }: { label: string; image?: ImageSourcePropType; count: number; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, padding: 10, borderRadius: 18, backgroundColor: pressed ? c.tintSoft : c.surface, borderWidth: 1, borderColor: c.border })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {image ? <Photo source={image} width={52} style={{ width: 44, height: 44 }} /> : <AppText variant="title" color={c.primary}>{label.charAt(0)}</AppText>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyBold">{label}</AppText>
        <AppText variant="caption" muted>{count === 1 ? t("srCountOne") : t("srCount", { n: count })}</AppText>
      </View>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <Icon name="back" color={c.muted} size={18} />
      </View>
    </Pressable>
  );
}

/** The page around both searches: the search bar with voice, recent and popular words, then the section's own content. */
function Frame({ vertical, query, setQuery, children, after }: { vertical: Vertical; query: string; setQuery: (q: string) => void; children: ReactNode; after?: ReactNode }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [voiceOpen, setVoiceOpen] = useState(voice === "1");
  const [heard, setHeard] = useState<{ text: string; query: string } | null>(null);
  const hasCart = useCart((s) => s.items.length > 0);
  const recent = useRecentSearches((s) => s.recent[vertical]) ?? [];
  const remember = useRecentSearches((s) => s.add);
  const forget = useRecentSearches((s) => s.clear);
  const words = t(vertical === "grocery" ? "searchWordsGrocery" : "searchWords").split(",").map((w) => w.trim()).filter(Boolean);
  const empty = query.trim().length === 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 }}>
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
            onSubmitEditing={() => remember(vertical, query)}
            returnKeyType="search"
            autoFocus={voice !== "1"}
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            placeholderTextColor={c.muted}
            style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink }}
            accessibilityLabel={t(vertical === "grocery" ? "searchGrocery" : "searchPlaceholder")}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("close")}>
              <Icon name="close" color={c.muted} size={18} strokeWidth={2.4} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setVoiceOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("voiceSearch")}
            style={({ pressed }) => ({ width: 40, height: 40, marginRight: -9, borderRadius: 20, backgroundColor: pressed ? c.primaryPressed : c.primary, alignItems: "center", justifyContent: "center" })}
          >
            <Icon name="mic" color="#FFFFFF" size={18} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: hasCart ? CART_BAR_SPACE + 20 : 28, gap: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {heard && heard.query === query ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.tint }}>
            <Icon name="mic" color={c.primary} size={14} />
            <AppText variant="caption" color={c.primary} style={{ flexShrink: 1 }}>{t("voiceHeard", { text: heard.text })}</AppText>
          </View>
        ) : null}

        {empty && recent.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Heading title={t("srRecent")} action={t("srClear")} onAction={() => forget(vertical)} />
            <Chips words={recent} icon="clock" onPick={setQuery} />
          </View>
        ) : null}
        {empty ? (
          <View style={{ gap: 12 }}>
            <Heading title={t("srTry")} />
            <Chips words={words} icon="search" onPick={setQuery} tinted />
            <AppText variant="caption" muted style={{ paddingHorizontal: 20 }}>{t("searchHint")}</AppText>
          </View>
        ) : null}

        {children}
      </ScrollView>

      <CartBar />
      {after}
      <VoiceSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onResult={(text) => {
          const q = toQuery(text);
          setHeard({ text, query: q });
          setQuery(q);
          remember(vertical, q);
          setVoiceOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

/** What a typed query found: the count, the cards, or a plain "nothing found" with a way back to the landing. */
function Results({ query, strong, close, ready, children }: { query: string; strong: number; close: number; ready: boolean; children: ReactNode }) {
  const { c } = useTheme();
  const t = useT();
  if (!ready) return null;
  if (strong === 0 && close === 0) {
    return (
      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 32, paddingTop: 36 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="search" color={c.primary} size={30} />
        </View>
        <AppText variant="bodyBold" style={{ textAlign: "center" }}>{t("noResults", { q: query.trim() })}</AppText>
        <AppText variant="caption" muted style={{ textAlign: "center" }}>{t("searchHint")}</AppText>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {strong > 0 ? (
        <AppText variant="label" muted style={{ paddingHorizontal: 20 }}>{strong === 1 ? t("srResultOne") : t("srResults", { n: strong })}</AppText>
      ) : null}
      {children}
    </View>
  );
}

function Pad({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 20 }}>{children}</View>;
}

function Grid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: 20 }}>{children}</View>;
}

function Heading({ title, action, onAction, icon, color }: { title: string; action?: string; onAction?: () => void; icon?: IconName; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20 }}>
      {icon ? <Icon name={icon} color={color ?? c.ink} size={18} /> : null}
      <AppText variant="title" style={{ flex: 1, fontSize: 17, lineHeight: 22 }}>{title}</AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <AppText variant="label" color={c.primary}>{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tappable words that fill the search box; they wrap onto as many lines as they need. */
function Chips({ words, icon, onPick, tinted = false }: { words: string[]; icon: IconName; onPick: (w: string) => void; tinted?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 }}>
      {words.map((w) => (
        <Pressable
          key={w}
          onPress={() => onPick(w)}
          accessibilityRole="button"
          accessibilityLabel={w}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "100%", minHeight: 38, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 19, backgroundColor: pressed ? c.tint : tinted ? c.tintSoft : c.surface, borderWidth: 1, borderColor: tinted ? c.tint : c.border })}
        >
          <Icon name={icon} color={tinted ? c.primary : c.muted} size={15} />
          <AppText variant="label" style={{ flexShrink: 1, fontSize: 13 }}>{w}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

type Tile = { id: string; label: string; image?: ImageSourcePropType; count: number };

/** A sideways row of categories: photo on the section's tint, name, how many products are inside. */
function Browse({ title, tiles, onPick }: { title: string; tiles: Tile[]; onPick: (tile: Tile) => void }) {
  const { c } = useTheme();
  const t = useT();
  if (tiles.length === 0) return null;
  const W = 118;
  return (
    <View style={{ gap: 12 }}>
      <Heading title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: "flex-start" }}>
        {tiles.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => onPick(b)}
            accessibilityRole="button"
            accessibilityLabel={b.label}
            style={({ pressed }) => ({ width: W, padding: 8, gap: 8, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.85 : 1 })}
          >
            <View style={{ height: 86, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {b.image ? <Photo source={b.image} width={W} style={{ width: "88%", height: "88%" }} /> : <AppText variant="title" color={c.primary} style={{ fontSize: 28 }}>{b.label.charAt(0)}</AppText>}
            </View>
            <View style={{ gap: 2, paddingHorizontal: 2, paddingBottom: 2 }}>
              <AppText variant="bodyBold" style={{ fontSize: 13, lineHeight: 17 }}>{b.label}</AppText>
              <AppText variant="caption" muted style={{ fontSize: 11.5 }}>{b.count === 1 ? t("srCountOne") : t("srCount", { n: b.count })}</AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
