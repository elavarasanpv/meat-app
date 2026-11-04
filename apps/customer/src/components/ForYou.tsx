import { useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useSuggestions, type Suggestion } from "@/hooks/useSuggestions";
import { bannerImage, productImage } from "@/lib/images";
import { formatQty, useCart } from "@/store/cart";
import { useLang, useT, type TKey } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const GAP = 12;
const H = 164;

/**
 * "For you": promo-style banners from the customer's own orders (weekday
 * habit, favourite, last basket) or what's popular nearby. One tap adds the
 * items to the cart; nothing is ordered automatically.
 */
export function ForYou() {
  const { c } = useTheme();
  const t = useT();
  const q = useSuggestions();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const list = q.data ?? [];
  if (!list.length) return null;
  const cardW = width - 40;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20 }}>
        <Icon name="sparkle" color={c.primary} size={18} />
        <AppText variant="title">{t("forYou")}</AppText>
      </View>
      <ScrollView
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + GAP}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP)))}
        contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}
      >
        {list.map((s, i) => (
          <Banner key={`${s.kind}-${i}`} s={s} width={cardW} />
        ))}
      </ScrollView>
      {list.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {list.map((_, i) => (
            <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.primary : c.border }} />
          ))}
        </View>
      )}
    </View>
  );
}

const KIND_KEY: Record<Suggestion["kind"], TKey> = { habit: "sugHabit", favourite: "sugFav", last: "sugLast", popular: "sugPopular" };
/** Warm card tints per kind, so a row of banners doesn't look like one long strip. */
const TINT: Record<Suggestion["kind"], [string, string]> = {
  habit: ["#FFE1D3", "#FDEFE6"],
  favourite: ["#FBE7C8", "#FFF4E3"],
  last: ["#FDE6DF", "#FFF6EE"],
  popular: ["#E6F2E7", "#F3FAF3"],
};

function Banner({ s, width }: { s: Suggestion; width: number }) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((x) => x.lang);
  const upsert = useCart((x) => x.upsert);
  const inCart = useCart((x) => s.items.every((i) => x.items.some((ci) => ci.productId === i.productId)));
  const pop = useRef(new Animated.Value(1)).current;

  const first = s.items[0];
  const name = (lang === "ta" && first.nameTa) || first.name;
  const more = s.items.length - 1;
  const title = s.kind === "habit" ? t("sugHabit", { day: t(`day_${s.day ?? "sunday"}` as TKey) }) : t(KIND_KEY[s.kind]);
  const line = `${formatQty(first.qty, first.unit)} ${name}${more > 0 ? ` ${t("plusMore", { n: more })}` : ""}`;
  const imgW = Math.round(width * 0.46);

  function add() {
    for (const i of s.items) {
      upsert({ productId: i.productId, name: i.name, nameTa: i.nameTa ?? undefined, unit: i.unit, price: i.price, qty: i.qty, size: i.unit === "kg" ? (i.size ?? "medium") : undefined });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.timing(pop, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }

  return (
    <Animated.View style={{ width, height: H, borderRadius: radius.card, overflow: "hidden", transform: [{ scale: pop }] }}>
      <LinearGradient colors={TINT[s.kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      {/* soft spotlight behind the photo */}
      <View style={{ position: "absolute", right: -40, top: -30, width: imgW + 70, height: imgW + 70, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.5)" }} />
      <Image
        source={bannerImage(first.name) ?? productImage(first.name, first.imagePath)}
        resizeMode="contain"
        style={{ position: "absolute", right: -6, top: 6, width: imgW + 10, height: H - 12 }}
      />
      {more > 0 && s.items[1] && (
        <View style={{ position: "absolute", right: imgW - 26, bottom: 10, width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Image source={bannerImage(s.items[1].name) ?? productImage(s.items[1].name, s.items[1].imagePath)} resizeMode="contain" style={{ width: 52, height: 52 }} />
        </View>
      )}

      <View style={{ flex: 1, padding: 16, paddingRight: imgW - 10, justifyContent: "space-between" }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="sparkle" color={c.primary} size={11} />
            <AppText variant="label" color={c.primary} style={{ fontSize: 10.5, letterSpacing: 0.6, lineHeight: 14 }}>
              {title.toUpperCase()}
            </AppText>
          </View>
          <AppText numberOfLines={2} style={{ fontFamily: lang === "ta" ? undefined : fonts.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 }}>
            {line}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
            <AppText style={{ fontFamily: fonts.bodyExtra, fontSize: 15, color: c.price }}>₹{s.total.toLocaleString("en-IN")}</AppText>
            <AppText variant="caption" muted>{t("todayPrice")}</AppText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={add}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            height: 38,
            paddingHorizontal: 16,
            borderRadius: 19,
            backgroundColor: inCart ? "#FFFFFF" : pressed ? c.primaryPressed : c.ink,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderWidth: inCart ? 1.5 : 0,
            borderColor: c.primary,
          })}
        >
          <Icon name={inCart ? "check" : "cart"} color={inCart ? c.primary : "#FFFFFF"} size={15} />
          <AppText variant="label" color={inCart ? c.primary : "#FFFFFF"} style={{ fontSize: 13 }}>
            {inCart ? t("inCart") : t("shopNow")}
          </AppText>
        </Pressable>
      </View>
    </Animated.View>
  );
}
