import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useOfferQuote, type Quote } from "@/hooks/useOffers";
import { DELIVERY_FEE, FREE_DELIVERY_ABOVE, useCart } from "@/store/cart";
import { useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

/**
 * Bill with the best offer applied and a coupon box. The amount here is a
 * server preview; the order is re-priced on the server when it's placed.
 * Returns the total so the caller can put it on its button.
 */
export function useBill(pincode?: string) {
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const quote = useOfferQuote(items, coupon, pincode);
  const itemTotal = items.reduce((t, i) => t + Math.round(i.price * i.qty), 0);
  const discount = quote.data?.discount ?? 0;
  const delivery = itemTotal === 0 || itemTotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  return { itemTotal, discount, delivery, toPay: itemTotal - discount + delivery, quote: quote.data, quoting: quote.isFetching };
}

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

export function BillSummary({ bill }: { bill: ReturnType<typeof useBill> }) {
  const { c } = useTheme();
  const t = useT();
  const coupon = useCart((s) => s.coupon);
  const setCoupon = useCart((s) => s.setCoupon);
  const [typing, setTyping] = useState("");
  const [open, setOpen] = useState(false);
  const q = bill.quote;
  const rejected = coupon && q?.couponRejected ? q.couponRejected : null;
  const couponWon = coupon && q?.code === coupon;

  const row = { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
  return (
    <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
      {/* coupon */}
      {coupon ? (
        <View style={{ ...row, padding: 10, borderRadius: radius.input, backgroundColor: rejected ? c.surface2 : "#DDF3E6", borderWidth: 1, borderStyle: "dashed", borderColor: rejected ? c.border : "#1E8A4F" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Icon name={rejected ? "receipt" : "check"} color={rejected ? c.muted : "#1E8A4F"} size={16} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" style={{ fontSize: 13, color: rejected ? c.ink : "#1E8A4F" }}>{coupon}</AppText>
              <AppText variant="caption" muted numberOfLines={2}>
                {rejected ? t(REJECT[rejected.reason], { n: rejected.minOrder ?? 0 }) : couponWon ? t("cpApplied", { amt: q!.discount }) : q?.couponBeaten ? t("cpBeaten") : "…"}
              </AppText>
            </View>
          </View>
          <Pressable hitSlop={8} onPress={() => setCoupon(null)}>
            <AppText variant="label" color={c.primary}>{t("remove")}</AppText>
          </Pressable>
        </View>
      ) : open ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            autoFocus
            value={typing}
            onChangeText={(v) => setTyping(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
            autoCapitalize="characters"
            placeholder={t("cpPlaceholder")}
            placeholderTextColor={c.muted}
            style={{ flex: 1, height: 42, borderRadius: radius.input, borderWidth: 1.5, borderColor: c.primary, paddingHorizontal: 12, color: c.ink, fontSize: 15, letterSpacing: 1 }}
          />
          <Pressable
            disabled={typing.length < 3}
            onPress={() => {
              setCoupon(typing);
              setOpen(false);
              setTyping("");
            }}
            style={{ height: 42, paddingHorizontal: 16, borderRadius: radius.input, backgroundColor: typing.length < 3 ? c.surface2 : c.primary, justifyContent: "center" }}
          >
            <AppText variant="label" color={typing.length < 3 ? c.muted : "#FFFFFF"}>{t("cpApply")}</AppText>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)} style={{ ...row, paddingVertical: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="receipt" color={c.primary} size={16} />
            <AppText variant="bodyBold" color={c.primary} style={{ fontSize: 13 }}>{t("cpHave")}</AppText>
          </View>
          <Icon name="chevronDown" color={c.muted} size={14} />
        </Pressable>
      )}

      <View style={{ height: 1, backgroundColor: c.border }} />
      <View style={row}>
        <AppText variant="caption" muted>{t("itemTotal")}</AppText>
        <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {bill.itemTotal}</AppText>
      </View>
      {bill.discount > 0 && (
        <View style={row}>
          <AppText variant="caption" color="#1E8A4F" numberOfLines={1} style={{ flex: 1 }}>
            {q?.code ? t("cpLine", { code: q.code }) : q?.title}
          </AppText>
          <AppText variant="bodyBold" color="#1E8A4F" style={{ fontSize: 13 }}>− ₹ {bill.discount}</AppText>
        </View>
      )}
      <View style={row}>
        <AppText variant="caption" muted>{t("deliveryFee")}</AppText>
        {bill.delivery === 0 ? (
          <AppText variant="caption" color={c.successText}>{t("freeAbove", { n: FREE_DELIVERY_ABOVE })}</AppText>
        ) : (
          <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {bill.delivery}</AppText>
        )}
      </View>
      <View style={{ height: 1, backgroundColor: c.border }} />
      <View style={row}>
        <AppText variant="bodyBold">{t("toPay")}</AppText>
        <AppText variant="price" color={c.price} style={{ fontSize: 20, lineHeight: 25 }}>₹ {bill.toPay}</AppText>
      </View>
      {bill.discount > 0 && (
        <View style={{ alignSelf: "flex-start", backgroundColor: "#DDF3E6", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <AppText variant="label" color="#1E8A4F" style={{ fontSize: 11.5 }}>{t("youSave", { amt: bill.discount })}</AppText>
        </View>
      )}
      <AppText variant="caption" muted numberOfLines={2} style={{ lineHeight: 16 }}>{t("weightNote")}</AppText>
    </View>
  );
}
