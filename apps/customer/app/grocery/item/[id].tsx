import { useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { BasketConfirm, GROCERY, MiniCard } from "@/components/GroceryHome";
import { Icon, type IconName } from "@/components/Icon";
import { Photo } from "@/components/Photo";
import { ErrorState, Skeleton } from "@/components/States";
import { useGroceryCatalog, useGroceryItem, type GroceryItem } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { useHomePincode } from "@/hooks/useOffers";
import { useSlots } from "@/hooks/useOrders";
import { useLang, useLocalName, useT } from "@/i18n";
import { dayLabel, slotWindow } from "@/lib/format";
import { groceryImage } from "@/lib/images";
import { Accent, cardBackdrop, useTheme, withAccent } from "@/theme";

/** Rows of other items shown under the product. */
const ROW_MAX = 10;
const ROW_CARD = 150;
/** Descriptions longer than this start folded behind "Read more". */
const LONG_DESC = 180;

/** "₹60 / 100 g" from a pack like "250 g"; null when the pack is already the base amount or can't be read. */
function perUnit(price: number, pack: string | null): string | null {
  const m = pack?.trim().match(/^([\d.]+)\s*(g|kg|ml|l|pcs)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (!n) return null;
  const money = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  if (u === "g" || u === "ml") return n === 100 ? null : `₹${money((price / n) * 100)} / 100 ${u}`;
  if (u === "pcs") return n === 1 ? null : `₹${money(price / n)} / 1 pc`;
  return n === 1 ? null : `₹${money(price / n)} / 1 ${u === "l" ? "L" : "kg"}`;
}

/**
 * One grocery item. The photo fills the top on the backdrop the admin picked
 * and a sheet slides over it: when it arrives, brand, name, pack, price
 * against MRP and what the customer saves. Under it the description, then rows of similar items and more
 * from the same brand. The price + "Add to cart" bar stays pinned at the bottom
 * and turns into a stepper once the item is in the basket.
 */
export default function GroceryItemScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery", theme.dark);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const localName = useLocalName();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pincode = useHomePincode();
  const catalog = useGroceryCatalog(pincode);
  const detail = useGroceryItem(id);
  const slots = useSlots();
  const basket = useGroceryBasket(pincode);
  const [open, setOpen] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const item = catalog.data?.find((r) => r.master_product_id === id);
  const { alike, sameBrand } = useMemo(() => {
    const rest = (catalog.data ?? []).filter((r) => r.master_product_id !== id);
    // In-stock first, so the row never opens on things the customer can't add.
    const inStockFirst = (a: GroceryItem, b: GroceryItem) => Number(b.in_stock) - Number(a.in_stock);
    const alike = rest.filter((r) => r.category_id && r.category_id === item?.category_id).sort(inStockFirst).slice(0, ROW_MAX);
    const shown = new Set(alike.map((r) => r.master_product_id));
    const sameBrand = item?.brand ? rest.filter((r) => r.brand === item.brand && !shown.has(r.master_product_id)).sort(inStockFirst).slice(0, ROW_MAX) : [];
    return { alike, sameBrand };
  }, [catalog.data, id, item?.category_id, item?.brand]);

  if (!item) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground, padding: 20 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={c.ink} />
        </Pressable>
        <View style={{ marginTop: 20 }}>{catalog.isLoading ? <Skeleton style={{ height: 300, borderRadius: 24 }} /> : <ErrorState icon="cart" title={t("groceryNoItems")} onRetry={() => catalog.refetch()} />}</View>
      </SafeAreaView>
    );
  }

  const qty = basket.qtyOf(item.master_product_id);
  const basketTotal = Math.round(basket.items.reduce((sum, i) => sum + i.price * i.qty, 0));
  const hasMrp = item.mrp != null && item.mrp > item.selling_price;
  const off = hasMrp ? Math.round(((item.mrp! - item.selling_price) / item.mrp!) * 100) : 0;
  const saves = hasMrp ? Math.round(item.mrp! - item.selling_price) : 0;
  const pack = item.pack_size ?? (item.unit === "kg" ? `1 ${t("unitKg")}` : null);
  const per = perUnit(item.selling_price, item.pack_size);
  const img = groceryImage(item.image_path);
  const backdrop = cardBackdrop(item.card_bg, theme.dark);
  const nextSlot = slots.data?.[0];
  const arrives = nextSlot ? `${dayLabel(nextSlot.startsAt, { today: t("today"), tomorrow: t("tomorrow") })} · ${slotWindow(nextSlot.startsAt, nextSlot.endsAt)}` : null;
  const descText = lang === "ta" ? detail.data?.description_ta || detail.data?.description : detail.data?.description;
  const longDesc = (descText?.length ?? 0) > LONG_DESC;
  const qtyLabel = item.unit === "kg" ? `${qty} ${t("unitKg")}` : `${qty}`;

  const heroH = Math.round(Math.min(width * 0.9, 380)) + insets.top;
  const barH = insets.top + 60;
  // The top bar turns solid, with a small photo and the price, once the sheet has covered the hero.
  const solid = scrollY.interpolate({ inputRange: [heroH - barH - 70, heroH - barH - 20], outputRange: [0, 1], extrapolate: "clamp" });
  const round = { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" } as const;

  const row = (title: string, list: GroceryItem[], onAll?: () => void) => (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
        <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: GROCERY.accent }} />
        <AppText variant="subtitle" style={{ flex: 1 }}>{title}</AppText>
        {onAll ? (
          <Pressable onPress={onAll} hitSlop={10} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.tint }}>
            <AppText variant="label" color={c.primary}>{t("seeAll")}</AppText>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 10 }}>
        {list.map((r) => (
          <MiniCard key={r.master_product_id} item={r} width={ROW_CARD} qty={basket.qtyOf(r.master_product_id)} onAdd={() => basket.add(r)} onStep={(d) => basket.step(r, d)} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Accent value="grocery">
      <View style={{ flex: 1, backgroundColor: c.ground }}>
        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {/* Hero: the photo on its backdrop, drifting slower than the page */}
          <LinearGradient colors={[...backdrop.colors]} locations={[0.3, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ height: heroH, paddingTop: insets.top + 52, paddingBottom: 40, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <Animated.View style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", opacity: item.in_stock ? 1 : 0.5, transform: [{ translateY: scrollY.interpolate({ inputRange: [0, heroH], outputRange: [0, heroH * 0.35], extrapolateLeft: "clamp" }) }, { scale: scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.25, 1], extrapolateRight: "clamp" }) }] }}>
              {/* soft spotlight so the pack stands off the backdrop */}
              <View style={{ position: "absolute", width: width * 0.68, height: width * 0.68, borderRadius: width * 0.34, backgroundColor: theme.glow(0.55) }} />
              {img ? <Photo source={img} width={width * 0.8} priority="high" style={{ width: "78%", height: "100%" }} /> : <AppText style={{ fontSize: 88, lineHeight: 96 }} color={c.primary}>{item.name.charAt(0)}</AppText>}
            </Animated.View>
            {off > 0 && (
              <View style={{ position: "absolute", left: 16, bottom: 40, paddingHorizontal: 12, height: 28, borderRadius: 14, backgroundColor: GROCERY.accent, justifyContent: "center" }}>
                <AppText variant="label" color="#3D2E00">{t("percentOff", { n: off })}</AppText>
              </View>
            )}
          </LinearGradient>

          {/* Sheet over the hero: arrival, brand, name, pack, price */}
          <View style={{ marginTop: -26, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.ground, paddingTop: 10, gap: 18 }}>
            <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {arrives ? <Pill icon="clock" text={`${t("gt_arrives")} ${arrives}`} bg={c.tint} fg={c.primary} /> : null}
                {!item.in_stock ? <Pill text={t("outOfStock")} bg={c.border} fg={c.ink} /> : null}
              </View>

              <View style={{ gap: 4 }}>
                {item.brand ? <AppText variant="label" color={c.primary} style={{ letterSpacing: 0.6, textTransform: "uppercase" }}>{item.brand}</AppText> : null}
                <AppText variant="title" style={{ fontSize: 23, lineHeight: 29 }}>{localName(item)}</AppText>
              </View>

              {pack ? (
                <View style={{ flexDirection: "row" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 32, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: theme.tone.groceryLine }}>
                    <AppText variant="caption" muted>{t("pdNetQty")}</AppText>
                    <AppText variant="label">{pack}</AppText>
                  </View>
                </View>
              ) : null}

              {/* Price card */}
              <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: theme.tone.groceryBorder, overflow: "hidden" }}>
                <View style={{ padding: 14, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 4 }}>
                    <AppText variant="price" color={c.primary} style={{ fontSize: 30, lineHeight: 36 }}>₹{item.selling_price}</AppText>
                    {hasMrp ? <AppText variant="body" muted style={{ textDecorationLine: "line-through" }}>MRP ₹{item.mrp}</AppText> : null}
                    {off > 0 ? (
                      <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 6, backgroundColor: c.primary, justifyContent: "center" }}>
                        <AppText variant="label" color="#FFFFFF" style={{ fontSize: 11 }}>{t("percentOff", { n: off })}</AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="caption" muted>{[per, t("pdInclTax")].filter(Boolean).join(" · ")}</AppText>
                </View>
                {saves > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: GROCERY.accentSoft }}>
                    <Icon name="tag" color="#7A5A00" size={16} />
                    <AppText variant="label" color="#7A5A00" style={{ flex: 1 }}>{t("pdYouSave", { n: saves })}</AppText>
                  </View>
                ) : null}
              </View>

              {/* Description */}
              {descText ? (
                <View style={{ gap: 4, paddingTop: 2 }}>
                  <AppText variant="subtitle">{t("aboutItem")}</AppText>
                  <AppText variant="body" muted numberOfLines={longDesc && !open ? 4 : undefined}>{descText}</AppText>
                  {longDesc ? (
                    <Pressable onPress={() => setOpen((v) => !v)} hitSlop={10} accessibilityRole="button" style={{ alignSelf: "flex-start", paddingVertical: 2 }}>
                      <AppText variant="label" color={c.primary}>{t(open ? "pdShowLess" : "pdReadMore")}</AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {alike.length > 0 ? row(t("pdSimilar"), alike, item.category_id ? () => router.push(`/grocery/category/${item.category_id}`) : undefined) : null}
            {sameBrand.length > 0 ? row(t("pdMoreFrom", { brand: item.brand ?? "" }), sameBrand) : null}
          </View>
        </Animated.ScrollView>

        {/* Top bar: clear over the hero, solid with photo + price once the page has scrolled */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: barH, paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, opacity: solid }} />
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={round}>
            <Icon name="back" color={c.ink} />
          </Pressable>
          <Animated.View pointerEvents="none" style={{ flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 10, opacity: solid }}>
            {img ? <Photo source={img} style={{ width: 36, height: 36 }} /> : null}
            <View style={{ flex: 1 }}>
              <AppText variant="price" color={c.primary}>₹{item.selling_price}</AppText>
              {pack ? <AppText variant="caption" muted style={{ lineHeight: 15 }}>{pack}</AppText> : null}
            </View>
          </Animated.View>
          <Pressable onPress={() => router.push("/(tabs)/cart")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("viewCart")} style={round}>
            <Icon name="cart" color={c.ink} size={20} />
            {basket.items.length > 0 && <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }}><AppText variant="label" color="#FFFFFF" style={{ fontSize: 9, lineHeight: 12 }}>{basket.items.length}</AppText></View>}
          </Pressable>
        </View>

        {/* Pinned bar: price + Add, then stepper + View cart once it's in the basket */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: c.border, elevation: 16, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } }}>
          {qty > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", height: 52, borderRadius: 26, backgroundColor: c.primary }}>
              <Pressable onPress={() => basket.step(item, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Less" style={{ width: 46, height: 52, alignItems: "center", justifyContent: "center" }}>
                <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 22, lineHeight: 24 }}>−</AppText>
              </Pressable>
              <AppText variant="bodyBold" color="#FFFFFF" style={{ minWidth: 36, textAlign: "center", fontSize: 15 }}>{qtyLabel}</AppText>
              <Pressable onPress={() => basket.step(item, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="More" style={{ width: 46, height: 52, alignItems: "center", justifyContent: "center" }}>
                <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 22, lineHeight: 24 }}>+</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8 }}>
                <AppText variant="price" style={{ fontSize: 20, lineHeight: 26 }}>₹{item.selling_price}</AppText>
                {hasMrp ? <AppText variant="caption" muted style={{ textDecorationLine: "line-through" }}>₹{item.mrp}</AppText> : null}
              </View>
              <AppText variant="caption" muted style={{ lineHeight: 15 }}>{[pack, t("pdInclTax")].filter(Boolean).join(" · ")}</AppText>
            </View>
          )}
          <View style={{ flex: qty > 0 ? 1 : 1.15 }}>
            {qty > 0 ? (
              <Button label={`${t("viewCart")} · ₹ ${basketTotal}`} icon="cart" onPress={() => router.push("/(tabs)/cart")} />
            ) : (
              <Button label={item.in_stock ? t("addToCart") : t("outOfStock")} icon="cart" disabled={!item.in_stock} onPress={() => basket.add(item)} />
            )}
          </View>
        </View>

        <BasketConfirm basket={basket} />
      </View>
    </Accent>
  );
}

function Pill({ icon, text, bg, fg }: { icon?: IconName; text: string; bg: string; fg: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, backgroundColor: bg, flexShrink: 1 }}>
      {icon ? <Icon name={icon} color={fg} size={14} /> : null}
      <AppText variant="label" color={fg} style={{ flexShrink: 1 }}>{text}</AppText>
    </View>
  );
}
