import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { offerTag, useLiveOffers, type Quote } from "@/hooks/useOffers";
import { useCart } from "@/store/cart";
import { useLang, useT, type TKey } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const GREEN = "#1E8A4F";
const GREEN_BG = "#DDF3E6";
const AMBER = "#B4620A";
const AMBER_BG = "#FBEBD6";

const REJECT: Record<NonNullable<Quote["couponRejected"]>["reason"], TKey> = {
  not_found: "cpNotFound",
  not_live: "cpNotLive",
  min_order: "cpMinOrder",
  first_order_only: "cpFirstOnly",
  already_used: "cpUsed",
  fully_used: "cpFullyUsed",
  not_in_scope: "cpNotInScope",
  pincode: "cpPincode",
};

/**
 * "Offers & coupons" card above the bill: type a code or tap a live coupon.
 * Shows what the code did — applied with the saving, beaten by a better
 * automatic offer, or refused with the reason. The server decides; this just
 * reflects its quote.
 */
export function CouponCard({ quote, quoting }: { quote: Quote | undefined; quoting: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((x) => x.lang);
  const coupon = useCart((s) => s.coupon);
  const setCoupon = useCart((s) => s.setCoupon);
  const live = useLiveOffers().data ?? [];
  const coupons = live.filter((o) => o.kind === "coupon" && o.code);
  const [typing, setTyping] = useState("");

  const rejected = coupon && quote?.couponRejected ? quote.couponRejected : null;
  const won = !!coupon && quote?.code === coupon && (quote?.discount ?? 0) > 0;
  const beaten = !!coupon && !!quote?.couponBeaten;

  function apply(code: string) {
    setCoupon(code);
    setTyping("");
    Haptics.selectionAsync().catch(() => {});
  }

  return (
    <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
          <Icon name="tag" color={c.primary} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>{t("cpTitle")}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{coupon ? (won ? t("cpApplied", { amt: quote!.discount }) : beaten ? t("cpBeatenShort") : rejected ? t("cpNotApplied") : "…") : t("cpSub")}</AppText>
        </View>
        {quoting && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, opacity: 0.6 }} />}
      </View>

      {coupon ? (
        /* applied / beaten / rejected ticket */
        <View style={{ marginHorizontal: 16, marginBottom: 14, flexDirection: "row", borderRadius: radius.input, overflow: "hidden", backgroundColor: rejected ? AMBER_BG : won ? GREEN_BG : c.surface2 }}>
          <View style={{ width: 44, alignItems: "center", justifyContent: "center", backgroundColor: rejected ? AMBER : won ? GREEN : c.muted }}>
            <Icon name={rejected ? "close" : "check"} color="#FFFFFF" size={18} />
          </View>
          {/* ticket notch */}
          <View style={{ width: 0, borderLeftWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.9)" }} />
          <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppText style={{ fontFamily: fonts.display, fontSize: 16, letterSpacing: 1.2, color: rejected ? AMBER : won ? GREEN : c.ink }}>{coupon}</AppText>
              {won && (
                <View style={{ backgroundColor: GREEN, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <AppText variant="label" color="#FFFFFF" style={{ fontSize: 11 }}>− ₹{quote!.discount}</AppText>
                </View>
              )}
            </View>
            <AppText variant="caption" numberOfLines={2} style={{ color: rejected ? AMBER : won ? GREEN : c.muted }}>
              {rejected ? t(REJECT[rejected.reason], { n: rejected.minOrder ?? 0 }) : won ? t("cpWonLine") : beaten ? t("cpBeaten") : "…"}
            </AppText>
          </View>
          <Pressable onPress={() => setCoupon(null)} hitSlop={8} accessibilityLabel={t("remove")} style={{ paddingHorizontal: 12, justifyContent: "center" }}>
            <AppText variant="label" color={c.primary}>{rejected ? t("cpChange") : t("remove")}</AppText>
          </Pressable>
        </View>
      ) : (
        /* code entry */
        <View style={{ marginHorizontal: 16, marginBottom: 12, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 46, borderRadius: radius.input, borderWidth: 1.5, borderColor: typing ? c.primary : c.border, backgroundColor: c.ground, paddingLeft: 12 }}>
            <Icon name="receipt" color={typing ? c.primary : c.muted} size={16} />
            <TextInput
              value={typing}
              onChangeText={(v) => setTyping(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t("cpPlaceholder")}
              placeholderTextColor={c.muted}
              onSubmitEditing={() => typing.length >= 3 && apply(typing)}
              style={{ flex: 1, height: 46, color: c.ink, fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 1 }}
            />
          </View>
          <Pressable
            disabled={typing.length < 3}
            onPress={() => apply(typing)}
            style={({ pressed }) => ({ height: 46, paddingHorizontal: 18, borderRadius: radius.input, backgroundColor: typing.length < 3 ? c.surface2 : pressed ? c.primaryPressed : c.primary, justifyContent: "center" })}
          >
            <AppText variant="label" color={typing.length < 3 ? c.muted : "#FFFFFF"} style={{ fontSize: 14 }}>{t("cpApply")}</AppText>
          </Pressable>
        </View>
      )}

      {/* live coupons to tap */}
      {!coupon && coupons.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {coupons.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => apply(o.code!)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 10, paddingRight: 12, height: 40, borderRadius: radius.input, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.primary, backgroundColor: pressed ? c.tint : c.tintSoft })}
            >
              <View style={{ backgroundColor: c.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <AppText variant="label" color="#FFFFFF" style={{ fontSize: 10.5 }}>{offerTag(o)}</AppText>
              </View>
              <View>
                <AppText style={{ fontFamily: fonts.bodyExtra, fontSize: 12.5, letterSpacing: 1, color: c.primary, lineHeight: 15 }}>{o.code}</AppText>
                <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 13, maxWidth: 150 }}>{(lang === "ta" && o.titleTa) || o.title}</AppText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
