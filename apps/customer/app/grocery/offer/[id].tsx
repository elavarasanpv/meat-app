import { useMemo } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { CartBar, CART_BAR_SPACE } from "@/components/CartBar";
import { BasketConfirm, GroceryCard } from "@/components/GroceryHome";
import { offerLook, OfferSticker, useOfferWords } from "@/components/GroceryOffers";
import { Icon } from "@/components/Icon";
import { Photo } from "@/components/Photo";
import { ErrorState, ListSkeleton } from "@/components/States";
import { useGroceryCatalog, useGroceryOffers } from "@/hooks/useGrocery";
import { useGroceryBasket } from "@/hooks/useGroceryBasket";
import { useHomePincode } from "@/hooks/useOffers";
import { useLocalName, useT } from "@/i18n";
import { groceryThumb } from "@/lib/images";
import { queryState } from "@/lib/network";
import { Accent, useTheme, withAccent } from "@/theme";

const GAP = 12;

/**
 * The products of one shop offer that covers many (chosen products, or a
 * whole category): the offer on a slim banner, then the 2-up product cards,
 * each with its own offer badge.
 */
export default function GroceryOfferScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery", theme.dark);
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const words = useOfferWords();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - GAP) / 2);
  const { id } = useLocalSearchParams<{ id: string }>();
  const pincode = useHomePincode();
  const offers = useGroceryOffers(pincode);
  const catalog = useGroceryCatalog(pincode);
  const basket = useGroceryBasket(pincode);
  const cs = queryState(catalog);

  const offer = offers.data?.find((o) => o.id === id);
  const rows = useMemo(() => {
    const ids = new Set(offer?.product_ids ?? []);
    return (catalog.data ?? []).filter((r) => ids.has(r.master_product_id));
  }, [catalog.data, offer]);
  const w = offer ? words(offer) : null;
  const look = offer ? offerLook(offer) : null;
  const banner = groceryThumb(offer?.banner_path);
  const loading = cs.loading || offers.isLoading;

  return (
    <Accent value="grocery">
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, minHeight: 52 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Icon name="back" color={c.ink} size={18} />
          </Pressable>
          <AppText variant="title" style={{ flex: 1 }}>{t("todayOffer")}</AppText>
        </View>

        {w && look ? (
          <LinearGradient colors={[...look.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginHorizontal: 20, marginBottom: 12, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" }}>
            <View pointerEvents="none" style={{ position: "absolute", right: -30, top: -40, width: 120, height: 120, borderRadius: 60, borderWidth: 16, borderColor: "rgba(255,255,255,0.12)" }} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 22 }}>{w.headline}</AppText>
              <AppText variant="label" color="rgba(255,255,255,0.94)" style={{ fontSize: 12, lineHeight: 16 }}>{w.cover}</AppText>
              {offer?.kind === "bogo" ? <AppText variant="caption" color="rgba(255,255,255,0.94)" style={{ fontSize: 12, lineHeight: 16, marginTop: 2 }}>{offer.mix && offer.free_name ? t("go_mixNoteItem", { buy: offer.buy_qty ?? 0, free: offer.free_qty ?? 0, name: localName({ name: offer.free_name, name_ta: offer.free_name_ta }) }) : t(offer.mix ? "go_mixNote" : "go_sameNote", { buy: offer.buy_qty ?? 0, free: offer.free_qty ?? 0 })}</AppText> : null}
            </View>
            {/* The offer's own picture when it has one, else a sticker that says the deal. */}
            {banner ? (
              <View style={{ transform: [{ rotate: "4deg" }] }}>
                <Photo source={banner} width={76} contentFit="cover" style={{ width: 76, height: 76, borderRadius: 16 }} />
              </View>
            ) : offer ? <OfferSticker offer={offer} size={92} /> : null}
          </LinearGradient>
        ) : null}

        {loading || cs.failed || rows.length === 0 ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            {loading ? (
              <ListSkeleton rows={4} height={cardWidth * 1.2} />
            ) : cs.failed ? (
              <ErrorState onRetry={() => catalog.refetch()} />
            ) : (
              <ErrorState icon="cart" title={t("go_over")} compact onRetry={() => { void offers.refetch(); void catalog.refetch(); }} />
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
