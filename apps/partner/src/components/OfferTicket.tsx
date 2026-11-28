import { Image, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { shopOfferColors, shopOfferHeadline } from "@thanjozmart/shared";
import type { OfferKind, OfferScope } from "@/hooks/useDealer";
import { useLang, useT } from "@/i18n";
import { productImage } from "@/lib/images";
import { Txt } from "@/ui";

/** One colour pair per kind of offer, the same in the shop app and the customer app. */
export const OFFER_LOOK: Record<OfferKind, { from: string; to: string; mark: string }> = {
  price: { from: "#E4461F", to: "#F2803A", mark: "%" },
  bogo: { from: "#F08A24", to: "#F7B733", mark: "1+1" },
  free_gift: { from: "#1F8A4C", to: "#49B46E", mark: "🎁" },
  next_order: { from: "#5B43C9", to: "#8E6BF0", mark: "₹" },
};

export type TicketFacts = {
  kind: OfferKind;
  pct?: number | null;
  buyQty?: number | null;
  mix?: boolean | null;
  color?: string | null;
  freeQty?: number | null;
  minOrder?: number | null;
  maxDiscount?: number | null;
  product?: { name: string; nameTa: string | null; imagePath: string | null; packSize?: string | null } | null;
  scope?: OfferScope;
  productIds?: string[] | null;
  category?: { name: string; nameTa: string | null } | null;
  bannerPath?: string | null;
  /** A picture just picked on this phone, not uploaded yet. */
  bannerUri?: string | null;
};

/** The small coloured offer card, close to what the customer sees. */
export function OfferTicket({ o, sub }: { o: TicketFacts; sub?: string }) {
  const lang = useLang((s) => s.lang);
  const look = { ...OFFER_LOOK[o.kind], ...shopOfferColors(o.kind, o.color) };
  const head = shopOfferHeadline({ ...o, product: null })[lang];
  const t = useT();
  // An offer on many products names the category or the count.
  const many = (o.kind === "price" || o.kind === "bogo") && (o.scope === "products" || o.scope === "category");
  const p = many ? null : o.product;
  const name = many
    ? o.scope === "category"
      ? o.category ? (lang === "ta" && o.category.nameTa ? o.category.nameTa : o.category.name) : null
      : o.productIds?.length ? `${o.productIds.length} ${t("offerNProducts")}` : null
    : p ? (lang === "ta" && p.nameTa ? p.nameTa : p.name) : null;
  // The offer's own picture first, else a product's photo, else the mark.
  const own = o.bannerUri ? { uri: o.bannerUri } : o.bannerPath ? productImage("", o.bannerPath) : undefined;
  const img = own ?? (o.product ? productImage(o.product.name, o.product.imagePath) : undefined);
  return (
    <LinearGradient colors={[look.from, look.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" }}>
      <View style={{ position: "absolute", right: -26, top: -26, width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(255,255,255,0.14)" }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt bold size={19} color="#FFFFFF">{head}</Txt>
        {name ? <Txt bold size={14} color="#FFFFFF">{name}{p?.packSize ? ` · ${p.packSize}` : ""}</Txt> : null}
        {sub ? <Txt size={13} color="rgba(255,255,255,0.92)">{sub}</Txt> : null}
      </View>
      <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {own ? <Image source={own} resizeMode="cover" style={{ width: 60, height: 60 }} /> : img ? <Image source={img} resizeMode="contain" style={{ width: 52, height: 52 }} /> : <Txt bold size={o.kind === "bogo" ? 18 : 24} color={look.from}>{look.mark}</Txt>}
      </View>
    </LinearGradient>
  );
}
