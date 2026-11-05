import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useCatalog";
import { offerTag, useLiveOffers } from "@/hooks/useOffers";
import { productImage } from "@/lib/images";
import { useLang, useLocalName, useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Products an offer covers, opened from its banner's Shop now. */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((x) => x.lang);
  const localName = useLocalName();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const offers = useLiveOffers();
  const products = useProducts();
  const o = offers.data?.find((x) => x.id === id);
  const list = (products.data ?? []).filter((p) => o && (!o.products.length || o.products.includes(p.id)));
  const cardWidth = Math.floor((width - 40 - 12) / 2);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" color={c.ink} size={20} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title" numberOfLines={1}>{o ? (lang === "ta" && o.titleTa) || o.title : t("todayOffer")}</AppText>
          {o && (
            <AppText variant="caption" muted numberOfLines={1}>
              {offerTag(o)}
              {o.minOrder ? ` · ${t("above", { n: o.minOrder })}` : ""} · {t("endsAt", { time: new Date(o.endsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })}
            </AppText>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: CART_BAR_SPACE + 20, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {list.map((p) => (
          <ProductCard
            key={p.id}
            width={cardWidth}
            name={localName(p)}
            pricePerKg={Number(p.base_price_per_kg)}
            unit={p.unit}
            image={productImage(p.name, p.image_path)}
            offerTag={o ? offerTag(o) : null}
            onPress={() => router.push(`/product/${p.id}`)}
            onAdd={() => router.push(`/product/${p.id}`)}
          />
        ))}
        {offers.data && !o && <AppText muted>{t("offerEnded")}</AppText>}
      </ScrollView>
      <CartBar />
    </SafeAreaView>
  );
}
