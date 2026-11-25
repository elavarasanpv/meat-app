import { useMemo } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { Icon } from "@/components/Icon";
import { ErrorState, ListSkeleton, Skeleton } from "@/components/States";
import { useGroceryBought, useGroceryCatalog, useGroceryCategories, type GroceryCategory, type GroceryItem } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { useLocalName, useT } from "@/i18n";
import { groceryThumb } from "@/lib/images";
import { queryState } from "@/lib/network";
import { cardBackdrop, radius, useTheme } from "@/theme";
import { Photo } from "@/components/Photo";

/** Grocery accent — the green/yellow half of the brand (GroceryHome design). */
export const GROCERY = {
  primary: "#1E8A4F",
  primaryPressed: "#166B3D",
  tint: "#E3F3E9",
  tintSoft: "#F1F8F3",
  accent: "#F2B705",
  accentSoft: "#FFF4CC",
} as const;

const GAP = 12;
const BOUGHT_SHOWN = 6;

/**
 * The Grocery half of Home: what the customer bought before (six, then a
 * "view all" banner), the main groups with their sub-category tiles, and
 * the biggest MRP deals. Products live on the sub-category and item pages.
 */
export function GroceryHome({ pincode }: { pincode?: string }) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const catalog = useGroceryCatalog(pincode);
  const cats = useGroceryCategories();
  const bought = useGroceryBought();
  const basket = useGroceryBasket(pincode);
  const cs = queryState(catalog);

  // Groups (top level) with their tiles (children); empty groups are skipped.
  const groups = useMemo(() => {
    const all = cats.data ?? [];
    return all.filter((x) => !x.parent_id).map((g) => ({ ...g, tiles: all.filter((x) => x.parent_id === g.id) })).filter((g) => g.tiles.length > 0);
  }, [cats.data]);

  const byId = useMemo(() => new Map((catalog.data ?? []).map((r) => [r.master_product_id, r])), [catalog.data]);
  const boughtItems = useMemo(() => (bought.data ?? []).map((id) => byId.get(id)).filter((r): r is GroceryItem => !!r), [bought.data, byId]);
  const deals = useMemo(() => (catalog.data ?? []).filter((r) => r.mrp && r.mrp > r.selling_price).sort((a, b) => (b.mrp! - b.selling_price) / b.mrp! - (a.mrp! - a.selling_price) / a.mrp!).slice(0, 8), [catalog.data]);
  const tileW = Math.floor((screenWidth - 40 - 3 * 10) / 4);
  const boughtW = Math.floor((screenWidth - 40 - 2 * 10) / 3);

  return (
    <View style={{ gap: 16 }}>
      {!pincode ? (
        <View style={{ paddingHorizontal: 20 }}><ErrorState icon="pin" title={t("setAddress")} compact /></View>
      ) : cs.failed ? (
        <View style={{ paddingHorizontal: 20 }}><ErrorState onRetry={() => catalog.refetch()} /></View>
      ) : null}

      {/* Bought before: 3 × 2, then "view all" */}
      {boughtItems.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle title={t("boughtBefore")} c={c} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 }}>
            {boughtItems.slice(0, BOUGHT_SHOWN).map((r) => (
              <MiniCard key={r.master_product_id} item={r} width={boughtW} qty={basket.qtyOf(r.master_product_id)} onAdd={() => basket.add(r)} onStep={(d) => basket.step(r, d)} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
            ))}
          </View>
          {boughtItems.length > BOUGHT_SHOWN && (
            <Pressable onPress={() => router.push("/grocery/bought")} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 20, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: pressed ? c.tint : c.tintSoft, borderWidth: 1, borderColor: c.tint, flexDirection: "row", alignItems: "center", gap: 10 })}>
              <Icon name="receipt" color={c.primary} size={18} />
              <AppText variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>{t("viewAllBought", { n: boughtItems.length })}</AppText>
              <View style={{ transform: [{ rotate: "180deg" }] }}><Icon name="back" color={c.primary} size={14} strokeWidth={2.6} /></View>
            </Pressable>
          )}
        </View>
      )}

      {/* Groups → sub-category tiles */}
      {cats.isLoading ? (
        <View style={{ paddingHorizontal: 20 }}><ListSkeleton rows={2} height={120} /></View>
      ) : groups.length === 0 && !cs.loading ? (
        <View style={{ paddingHorizontal: 20 }}><ErrorState icon="cart" title={t("groceryNoItems")} compact onRetry={() => cats.refetch()} /></View>
      ) : (
        groups.map((g) => (
          <View key={g.id} style={{ gap: 12 }}>
            <SectionTitle title={localName(g)} c={c} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 }}>
              {g.tiles.map((s) => (
                <Tile key={s.id} cat={s} width={tileW} label={localName(s)} onPress={() => router.push(`/grocery/category/${s.id}`)} c={c} />
              ))}
            </View>
          </View>
        ))
      )}

      {/* Mega deals */}
      {cs.loading ? (
        <View style={{ paddingHorizontal: 20 }}><Skeleton style={{ height: 180, borderRadius: 20 }} /></View>
      ) : deals.length > 0 ? (
        <View style={{ gap: 10 }}>
          <SectionTitle title={`🔥 ${t("megaDeals")}`} c={c} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {deals.map((r) => (
              <MiniCard key={r.master_product_id} item={r} width={150} qty={basket.qtyOf(r.master_product_id)} onAdd={() => basket.add(r)} onStep={(d) => basket.step(r, d)} onOpen={() => router.push(`/grocery/item/${r.master_product_id}`)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <BasketConfirm basket={basket} />
    </View>
  );
}

function SectionTitle({ title, c }: { title: string; c: ReturnType<typeof useTheme>["c"] }) {
  return (
    <View style={{ paddingHorizontal: 20, height: 26, justifyContent: "center" }}>
      <AppText variant="title" numberOfLines={1} style={{ fontSize: 19 }} color={c.ink}>{title}</AppText>
    </View>
  );
}

/** Sub-category tile: square photo on the green tint, label under it. */
function Tile({ cat, width, label, onPress, c }: { cat: GroceryCategory; width: number; label: string; onPress: () => void; c: ReturnType<typeof useTheme>["c"] }) {
  const img = groceryThumb(cat.image_path);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width, alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width, height: Math.round(width * 1.05), borderRadius: 18, backgroundColor: c.tint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {img ? <Photo source={img} width={width * 0.88} style={{ width: "88%", height: "88%" }} /> : <AppText variant="title" color={c.primary} style={{ fontSize: 26 }}>{label.charAt(0)}</AppText>}
      </View>
      <AppText variant="label" numberOfLines={2} style={{ fontSize: 12, lineHeight: 15, textAlign: "center" }}>{label}</AppText>
    </Pressable>
  );
}

/** Small product card (bought-before grid, deals row, cart suggestions): white, soft green shadow, photo, name, price, + in the corner. */
export function MiniCard({ item: r, width, qty, onAdd, onStep, onOpen }: { item: GroceryItem; width: number; qty: number; onAdd: () => void; onStep: (d: 1 | -1) => void; onOpen: () => void }) {
  const { c, tone } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const img = groceryThumb(r.image_path);
  const off = r.mrp && r.mrp > r.selling_price ? Math.round(((r.mrp - r.selling_price) / r.mrp) * 100) : 0;
  const q = r.unit === "kg" ? `${qty} ${t("unitKg")}` : `${qty}`;
  const pack = r.pack_size ? ` (${r.pack_size})` : "";
  const perKg = r.unit === "kg" ? `/${t("unitKg")}` : "";
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={r.name}
      style={{ width, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: tone.groceryBorder, padding: 10, gap: 8, opacity: r.in_stock ? 1 : 0.55, shadowColor: c.primary, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}
    >
      <View style={{ height: Math.round(width * 0.66), alignItems: "center", justifyContent: "center" }}>
        {img ? <Photo source={img} width={width * 0.86} style={{ width: "86%", height: "92%" }} /> : <AppText variant="title" color={c.primary} style={{ fontSize: 30 }}>{r.name.charAt(0)}</AppText>}
        {off > 0 && (
          <View style={{ position: "absolute", top: 0, left: 0, paddingHorizontal: 7, height: 18, borderRadius: 9, backgroundColor: GROCERY.accentSoft, justifyContent: "center" }}>
            <AppText variant="label" color="#7A5A00" style={{ fontSize: 9.5 }}>{t("percentOff", { n: off })}</AppText>
          </View>
        )}
      </View>
      <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, minHeight: 34 }}>{localName(r)}{pack}</AppText>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="price" color={c.primary} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontSize: 16, lineHeight: 20 }}>₹{r.selling_price}<AppText variant="caption" muted style={{ fontSize: 10 }}>{perKg}</AppText></AppText>
          {qty === 0 && r.mrp != null && r.mrp > r.selling_price ? <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5, textDecorationLine: "line-through" }}>₹{r.mrp}</AppText> : null}
        </View>
        {!r.in_stock ? null : qty > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", height: 34, borderRadius: 10, backgroundColor: c.primary, flexShrink: 0 }}>
            <Pressable onPress={() => onStep(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Less" style={{ width: 22, height: 34, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 15, lineHeight: 17 }}>−</AppText></Pressable>
            <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ minWidth: 14, textAlign: "center", fontSize: 11.5 }}>{q}</AppText>
            <Pressable onPress={() => onStep(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="More" style={{ width: 22, height: 34, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 15, lineHeight: 17 }}>+</AppText></Pressable>
          </View>
        ) : (
          <Pressable onPress={onAdd} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t("add")} ${r.name}`} style={({ pressed }) => ({ width: 36, height: 34, borderRadius: 10, backgroundColor: pressed ? c.primaryPressed : c.primary, alignItems: "center", justifyContent: "center" })}>
            <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 20, lineHeight: 22 }}>+</AppText>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

/** 2-up product card for sub-category pages: name, photo, "₹310 /5 kg · MRP", Add → stepper. */
export function GroceryCard({ item: r, width, qty, onAdd, onStep, onOpen }: { item: GroceryItem; width: number; qty: number; onAdd: () => void; onStep: (d: 1 | -1) => void; onOpen: () => void }) {
  const { c, dark } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const img = groceryThumb(r.image_path);
  const bg = cardBackdrop(r.card_bg, dark);
  const off = r.mrp && r.mrp > r.selling_price ? Math.round(((r.mrp - r.selling_price) / r.mrp) * 100) : 0;
  const per = r.pack_size ? `/${r.pack_size}` : r.unit === "kg" ? `/${t("unitKg")}` : "";
  const qtyLabel = r.unit === "kg" ? `${qty} ${t("unitKg")}` : `${qty}`;
  const height = Math.round(width * 1.22);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={r.name} style={{ width, height, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: bg.border, opacity: r.in_stock ? 1 : 0.55 }}>
      <LinearGradient colors={[...bg.colors]} locations={[0.35, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, padding: 12 }}>
        <AppText variant="title" style={{ fontSize: 14, lineHeight: 18, height: 36, paddingRight: off ? 54 : 0 }} numberOfLines={2}>{localName(r)}</AppText>
        {off > 0 ? (
          <View style={{ position: "absolute", top: 10, right: 10, paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: GROCERY.accent, justifyContent: "center" }}>
            <AppText variant="label" color="#3D2E00" numberOfLines={1} style={{ fontSize: 10.5 }}>{t("percentOff", { n: off })}</AppText>
          </View>
        ) : null}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {img ? <Photo source={img} width={width * 0.8} style={{ width: "80%", height: "85%" }} /> : <AppText style={{ fontSize: 40, lineHeight: 48 }} color={c.primary}>{r.name.charAt(0)}</AppText>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 40, marginTop: 2 }}>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
              <AppText variant="price" color={c.primary} numberOfLines={1} style={{ fontSize: 17, lineHeight: 21 }}>₹ {r.selling_price}</AppText>
              <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10 }}>{per}</AppText>
            </View>
            <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, textDecorationLine: off ? "line-through" : "none" }}>{r.mrp != null ? `MRP ₹${r.mrp}` : r.brand ?? " "}</AppText>
          </View>
          {!r.in_stock ? (
            <AppText variant="label" muted numberOfLines={1} style={{ fontSize: 11 }}>{t("outOfStock")}</AppText>
          ) : qty > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.pill, backgroundColor: c.primary, height: 36 }}>
              <Pressable onPress={() => onStep(-1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Less" style={{ width: 30, height: 36, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 20 }}>−</AppText></Pressable>
              <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13, minWidth: 28, textAlign: "center" }}>{qtyLabel}</AppText>
              <Pressable onPress={() => onStep(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="More" style={{ width: 30, height: 36, alignItems: "center", justifyContent: "center" }}><AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 20 }}>+</AppText></Pressable>
            </View>
          ) : (
            <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`${t("add")} ${r.name}`} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.primary, backgroundColor: pressed ? c.tint : c.surface, alignItems: "center", justifyContent: "center" })}>
              <AppText variant="label" color={c.primary}>{t("add")}</AppText>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** The "start a new basket?" sheet every grocery screen needs when a meat basket is open. */
export function BasketConfirm({ basket }: { basket: ReturnType<typeof useGroceryBasket> }) {
  const t = useT();
  return <ConfirmSheet visible={!!basket.pending} title={t("newBasketTitle")} message={t("newBasketMsg", { name: t("meatTab") })} confirmLabel={t("newBasketConfirm")} icon="cart" destructive={false} onConfirm={basket.replaceBasket} onClose={basket.dismiss} />;
}
