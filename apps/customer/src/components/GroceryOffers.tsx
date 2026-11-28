import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { shopOfferColors, shopOfferHeadline, type ShopOfferKind } from "@thanjozmart/shared";
import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { Photo } from "@/components/Photo";
import { offerBadge, offerIsMany, useGroceryOffers, type GroceryItem, type GroceryOffer, type GroceryQuote } from "@/hooks/useGrocery";
import { useLang, useLocalName, useT } from "@/i18n";
import { groceryThumb } from "@/lib/images";
import { useTheme } from "@/theme";

/** The colours one offer wears: the one it chose, else its kind's. */
export function offerLook(o: Pick<GroceryOffer, "kind" | "color">) {
  const p = shopOfferColors(o.kind, o.color);
  return { colors: [p.from, p.to] as const, ink: p.ink, mark: OFFER_LOOK[o.kind].mark };
}

/** One look per kind of offer, the same in the shop app and the admin. */
export const OFFER_LOOK: Record<ShopOfferKind, { colors: readonly [string, string]; ink: string; mark: string }> = {
  price: { colors: ["#E4461F", "#F2803A"], ink: "#B8361A", mark: "%" },
  bogo: { colors: ["#F08A24", "#F7B733"], ink: "#A85A00", mark: "1+1" },
  free_gift: { colors: ["#1F8A4C", "#49B46E"], ink: "#156A3C", mark: "🎁" },
  next_order: { colors: ["#5B43C9", "#8E6BF0"], ink: "#4330A0", mark: "₹" },
};
const GAP = 10;

/**
 * The offers strip on grocery Home: one slim card per live offer, swiped
 * sideways, with dots. A product offer opens that product; nothing here
 * says which shop made it.
 */
export function OfferStrip({ pincode }: { pincode?: string }) {
  const { c } = useTheme();
  const { width: screen } = useWindowDimensions();
  const offers = useGroceryOffers(pincode).data ?? [];
  const [at, setAt] = useState(0);
  if (offers.length === 0) return null;
  const many = offers.length > 1;
  // Several: the next card peeks in from the right.
  const cardW = many ? screen - 68 : screen - 40;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setAt(Math.max(0, Math.min(offers.length - 1, Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP)))));
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={cardW + GAP} snapToAlignment="start" onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}>
        {offers.map((o) => (
          <OfferCard key={o.id} offer={o} width={cardW} />
        ))}
      </ScrollView>
      {many && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 5 }}>
          {offers.map((o, i) => (
            <View key={o.id} style={{ width: i === at ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === at ? offerLook(offers[at]).colors[0] : c.border }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** The big words of an offer, in the customer's language. */
export function useOfferWords() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const localName = useLocalName();
  return (o: GroceryOffer) => ({
    headline: shopOfferHeadline({ kind: o.kind, pct: o.pct, buyQty: o.buy_qty, freeQty: o.free_qty, mix: o.mix, minOrder: o.min_order, maxDiscount: o.max_discount })[lang],
    /** What a many-product offer is on: the category, or how many products. */
    cover: o.scope === "category" && o.category_name ? localName({ name: o.category_name, name_ta: o.category_name_ta }) : t("go_nProducts", { n: o.product_ids?.length ?? 0 }),
  });
}

function OfferCard({ offer: o, width }: { offer: GroceryOffer; width: number }) {
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const words = useOfferWords()(o);
  const look = offerLook(o);
  const many = offerIsMany(o);
  // The offer's own picture first; else a product's photo (for a many-product offer, one of them).
  const banner = groceryThumb(o.banner_path);
  // buy-and-get-free wears its sticker unless the shop added a picture of its own
  const img = banner ?? (o.kind === "bogo" ? null : groceryThumb(o.image_path));
  const name = o.name ? `${localName({ name: o.name, name_ta: o.name_ta })}${o.pack_size ? ` (${o.pack_size})` : ""}` : "";
  const headline = words.headline;
  const sub =
    many ? words.cover
    : o.kind === "price" ? name
    : o.kind === "bogo" ? name
    : o.kind === "free_gift" ? t("go_giftSub", { name, n: o.free_qty ?? 1 })
    : t("go_nextSub", { min: o.min_order ?? 0, max: o.max_discount ?? 0 });
  const days = Math.ceil((new Date(o.ends_at).getTime() - Date.now()) / 86_400_000);
  const opens = many || (o.kind !== "next_order" && !!o.master_product_id);
  return (
    <Pressable
      disabled={!opens}
      onPress={() => router.push(many ? `/grocery/offer/${o.id}` : `/grocery/item/${o.master_product_id}`)}
      accessibilityRole={opens ? "button" : "text"}
      accessibilityLabel={`${headline}. ${sub}`}
      style={({ pressed }) => ({ width, borderRadius: 20, overflow: "hidden", opacity: pressed ? 0.92 : 1, shadowColor: look.colors[0], shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 })}
    >
      <LinearGradient colors={[...look.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 112, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 12 }}>
        {/* soft rings, like a printed coupon */}
        <View pointerEvents="none" style={{ position: "absolute", right: -34, top: -46, width: 150, height: 150, borderRadius: 75, borderWidth: 18, borderColor: "rgba(255,255,255,0.12)" }} />
        <View pointerEvents="none" style={{ position: "absolute", left: -22, bottom: -30, width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.10)" }} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText variant="title" color="#FFFFFF" style={{ fontSize: 19, lineHeight: 23 }}>{headline}</AppText>
          {sub ? <AppText variant="label" color="rgba(255,255,255,0.94)" style={{ fontSize: 12, lineHeight: 16 }}>{sub}</AppText> : null}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
            {o.kind === "price" && o.price != null ? (
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: "#FFFFFF" }}>
                <AppText variant="price" color={look.ink} style={{ fontSize: 15, lineHeight: 19 }}>₹{o.price}</AppText>
                {o.was_price != null && o.was_price > o.price ? <AppText variant="caption" color="#8A8480" style={{ fontSize: 11, textDecorationLine: "line-through" }}>₹{o.was_price}</AppText> : null}
              </View>
            ) : opens ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "#FFFFFF" }}>
                <AppText variant="label" color={look.ink} style={{ fontSize: 12 }}>{t("go_shop")}</AppText>
                <View style={{ transform: [{ rotate: "180deg" }] }}><Icon name="back" color={look.ink} size={11} strokeWidth={2.8} /></View>
              </View>
            ) : null}
            <AppText variant="caption" color="rgba(255,255,255,0.88)" style={{ fontSize: 11 }}>{days <= 1 ? t("go_endsToday") : t("go_endsIn", { n: days })}</AppText>
          </View>
        </View>
        {img ? (
          <View style={{ width: 78, height: 78, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", transform: [{ rotate: "4deg" }] }}>
            <Photo source={img} width={banner ? 78 : 70} contentFit={banner ? "cover" : "contain"} style={banner ? { width: 78, height: 78, borderRadius: 18 } : { width: 66, height: 66 }} />
          </View>
        ) : (
          <OfferSticker offer={o} size={74} />
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** A 14-point seal, for the gift sticker. */
const SEAL = Array.from({ length: 28 }, (_, i) => {
  const r = i % 2 ? 39 : 47;
  const a = (Math.PI * 2 * i) / 28;
  return `${(50 + r * Math.sin(a)).toFixed(1)},${(50 - r * Math.cos(a)).toFixed(1)}`;
}).join(" ");

/** One sticker shape per kind of offer, drawn on a 100 x 100 board. */
function StickerShape({ kind, ink, tone }: { kind: ShopOfferKind; ink: string; tone: string }) {
  if (kind === "bogo")
    // a paint splash, with drops flying off it
    return (
      <>
        <Path d="M52 3 C78 1 99 22 97 48 C96 74 78 97 52 96 C27 96 3 80 4 52 C5 27 26 5 52 3 Z" fill="#FFFFFF" opacity={0.35} transform="rotate(14 50 50)" />
        <Path d="M50 7 C72 5 93 21 93 46 C94 70 79 92 55 93 C31 95 8 81 7 56 C5 31 26 9 50 7 Z" fill={ink} />
        <Path d="M18 30 C30 12 58 6 76 16 C58 14 34 20 18 30 Z" fill={tone} opacity={0.7} />
        <Circle cx={12} cy={14} r={5} fill="#FFFFFF" opacity={0.9} />
        <Circle cx={90} cy={88} r={3.5} fill="#FFFFFF" opacity={0.9} />
        <Path d="M88 6 L99 11 L90 17 Z" fill="#FFE45C" />
        <Path d="M3 84 L12 90 L2 95 Z" fill="#FFE45C" />
      </>
    );
  if (kind === "price")
    // a shield tag, with a burst behind it
    return (
      <>
        <Polygon points={SEAL} fill="#FFFFFF" opacity={0.3} />
        <Path d="M16 10 H84 Q90 10 90 16 V60 L50 95 L10 60 V16 Q10 10 16 10 Z" fill={ink} />
        <Path d="M16 10 H84 Q90 10 90 16 V24 H10 V16 Q10 10 16 10 Z" fill={tone} opacity={0.75} />
        <Path d="M90 2 L100 8 L91 13 Z" fill="#FFE45C" />
        <Path d="M0 70 L9 75 L1 81 Z" fill="#FFE45C" />
      </>
    );
  if (kind === "free_gift")
    // a seal
    return (
      <>
        <Polygon points={SEAL} fill="#FFFFFF" opacity={0.35} transform="rotate(8 50 50) scale(1.04) translate(-2 -2)" />
        <Polygon points={SEAL} fill={ink} />
        <Circle cx={50} cy={50} r={33} fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
      </>
    );
  // next order: a speech bubble
  return (
    <>
      <Path d="M50 6 C76 6 96 22 96 44 C96 66 76 82 50 82 C45 82 41 81 37 80 L16 97 L22 73 C10 66 4 56 4 44 C4 22 24 6 50 6 Z" fill="#FFFFFF" opacity={0.35} transform="translate(3 2)" />
      <Path d="M50 6 C76 6 96 22 96 44 C96 66 76 82 50 82 C45 82 41 81 37 80 L16 97 L22 73 C10 66 4 56 4 44 C4 22 24 6 50 6 Z" fill={ink} />
      <Circle cx={92} cy={8} r={3} fill="#FFE45C" />
      <Circle cx={6} cy={90} r={2.5} fill="#FFE45C" />
    </>
  );
}

/**
 * A printed-style sticker that says the deal in big letters:
 * BUY 3 / GET 1 / FREE, 10% / OFF, and so on. A bold shape in the card's own
 * colour (one shape per kind of offer), lettered in chunky white.
 */
export function OfferSticker({ offer: o, size = 72 }: { offer: Pick<GroceryOffer, "kind" | "pct" | "buy_qty" | "free_qty" | "color">; size?: number }) {
  const t = useT();
  const look = offerLook(o);
  const k = size / 72;
  const lines: { text: string; big?: boolean }[] =
    o.kind === "bogo" ? [{ text: t("go_stkBuy", { n: o.buy_qty ?? 1 }) }, { text: t("go_stkGet", { n: o.free_qty ?? 1 }) }, { text: t("go_stkFree"), big: true }]
    : o.kind === "price" ? [{ text: `${Math.round(o.pct ?? 0)}%`, big: true }, { text: t("go_stkOff") }]
    : o.kind === "free_gift" ? [{ text: "🎁", big: true }, { text: t("go_stkGift") }]
    : [{ text: `${Math.round(o.pct ?? 0)}%`, big: true }, { text: t("go_stkNext") }];
  // the words sit a little high in the shapes that end in a point or a tail
  const lift = o.kind === "price" || o.kind === "next_order" ? size * 0.1 : 0;
  const words = (color: string, dx: number) => (
    <View style={{ position: "absolute", left: dx, top: dx, width: size, height: size - lift, alignItems: "center", justifyContent: "center", paddingHorizontal: size * 0.17, transform: [{ rotate: "-8deg" }] }}>
      {lines.map((l, i) => (
        <AppText key={i} variant="title" color={color} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: (l.big ? 19 : 12.5) * k, lineHeight: (l.big ? 21 : 14) * k, textAlign: "center", letterSpacing: 0 }}>{l.text}</AppText>
      ))}
    </View>
  );
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <StickerShape kind={o.kind} ink={look.ink} tone={look.colors[1]} />
      </Svg>
      {/* the letters twice: a dark copy just behind gives them a printed edge */}
      {words("rgba(0,0,0,0.35)", 1.5 * k)}
      {words("#FFFFFF", 0)}
    </View>
  );
}

/** The corner badge on a product card with a shop offer; null when the item has none. */
export function OfferBadge({ item, size = "sm" }: { item: Pick<GroceryItem, "offer_pct" | "bogo_buy" | "bogo_free">; size?: "sm" | "md" | "lg" }) {
  const t = useT();
  const b = offerBadge(item);
  if (!b) return null;
  const look = OFFER_LOOK[b.kind];
  const h = size === "lg" ? 28 : size === "md" ? 20 : 18;
  return (
    <LinearGradient colors={[...look.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: size === "lg" ? 12 : 7, minHeight: h, borderRadius: h / 2, justifyContent: "center" }}>
      <AppText variant="label" color="#FFFFFF" style={{ fontSize: size === "lg" ? 12.5 : size === "md" ? 10.5 : 9.5 }}>
        {b.kind === "bogo" ? t("go_bogoBadge", { buy: b.buy, free: b.free }) : t("percentOff", { n: b.pct })}
      </AppText>
    </LinearGradient>
  );
}

/** Free items the offers add to this basket: shown as lines under the customer's own. */
export function FreeLines({ quote }: { quote?: GroceryQuote }) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  if (!quote?.free.length) return null;
  return (
    <>
      {quote.free.map((f) => {
        const img = groceryThumb(f.imagePath);
        return (
          <View key={`${f.reason}:${f.masterProductId}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingBottom: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: c.successBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {img ? <Photo source={img} style={{ width: 56, height: 56 }} /> : <AppText style={{ fontSize: 24, lineHeight: 30 }}>🎁</AppText>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyBold" style={{ fontSize: 14, lineHeight: 18 }}>{localName({ name: f.name, name_ta: f.nameTa })}</AppText>
              <AppText variant="caption" color={c.successText} style={{ marginTop: 2 }}>{f.qty} × {t(f.reason === "gift" ? "go_freeGift" : "go_freeBogo")}</AppText>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9, backgroundColor: c.success }}>
                <AppText variant="label" color="#FFFFFF" style={{ fontSize: 11 }}>{t("free")}</AppText>
              </View>
              {/* priced like any other line: what it would have cost, struck, then ₹0 */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {f.value > 0 ? <AppText variant="caption" muted style={{ fontSize: 11, textDecorationLine: "line-through" }}>₹{f.value}</AppText> : null}
                <AppText variant="bodyBold" color={c.successText} style={{ fontSize: 14 }}>₹0</AppText>
              </View>
            </View>
          </View>
        );
      })}
    </>
  );
}

/** What else the basket can get, or will get: a gift a little further on, the coupon this order earns. */
export function BasketPerks({ quote }: { quote?: GroceryQuote }) {
  const t = useT();
  const localName = useLocalName();
  if (!quote) return null;
  const rows: { key: string; kind: ShopOfferKind; text: string; done: boolean }[] = [];
  if (quote.giftHint) rows.push({ key: "gift", kind: "free_gift", text: t("go_giftHint", { n: quote.giftHint.need, name: localName({ name: quote.giftHint.name, name_ta: quote.giftHint.nameTa }) }), done: false });
  if (quote.earns) rows.push({ key: "earns", kind: "next_order", text: t("go_earns", { n: quote.earns.pct, max: quote.earns.maxDiscount, days: quote.earns.validDays }), done: true });
  else if (quote.earnHint) rows.push({ key: "earn", kind: "next_order", text: t("go_earnHint", { need: quote.earnHint.need, n: quote.earnHint.pct }), done: false });
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => {
        const look = OFFER_LOOK[r.kind];
        return (
          <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderStyle: r.done ? "solid" : "dashed", borderColor: look.colors[1], backgroundColor: `${look.colors[0]}14` }}>
            <LinearGradient colors={[...look.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }}>
              {r.done ? <Icon name="check" color="#FFFFFF" size={15} strokeWidth={3} /> : <AppText variant="label" color="#FFFFFF" style={{ fontSize: 13 }}>{look.mark}</AppText>}
            </LinearGradient>
            <AppText variant="label" style={{ flex: 1, fontSize: 12.5, lineHeight: 17 }}>{r.text}</AppText>
          </View>
        );
      })}
    </View>
  );
}
