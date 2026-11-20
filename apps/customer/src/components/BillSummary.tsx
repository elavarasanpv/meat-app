import { View } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useGroceryFee } from "@/hooks/useGrocery";
import { useOfferQuote } from "@/hooks/useOffers";
import { CouponCard } from "./CouponCard";
import { cartTotals, cartVertical, useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Bill with the best offer applied and a coupon box. The amount here is a
 * server preview; the order is re-priced on the server when it's placed.
 * Returns the total so the caller can put it on its button.
 */
export function useBill(pincode?: string) {
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const feeRule = useCart((s) => s.feeRule);
  const vertical = cartVertical(items);
  // Offers are meat-only for now; a grocery basket never asks for a quote.
  const quote = useOfferQuote(items, coupon, pincode, vertical === "meat");
  // Grocery: the rule for the address being checked out wins over the one captured in the shop;
  // the basket's copy covers the moment before the lookup answers.
  const liveFee = useGroceryFee(vertical === "grocery" ? pincode : undefined);
  const totals = cartTotals(items, liveFee.data !== undefined ? liveFee.data : feeRule);
  const discount = vertical === "meat" ? quote.data?.discount ?? 0 : 0;
  return { ...totals, vertical, discount, toPay: totals.itemTotal - discount + totals.delivery, quote: vertical === "meat" ? quote.data : undefined, quoting: vertical === "meat" && quote.isFetching };
}


export function BillSummary({ bill }: { bill: ReturnType<typeof useBill> }) {
  const { c } = useTheme();
  const t = useT();
  const q = bill.quote;
  const row = { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
  return (
    <View style={{ gap: 12 }}>
      {bill.vertical === "meat" && <CouponCard quote={q} quoting={bill.quoting} />}
      <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
        <View style={row}>
          <AppText variant="caption" muted>{t("itemTotal")}</AppText>
          <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {bill.itemTotal}</AppText>
        </View>
        {bill.discount > 0 && (
          <View style={row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Icon name="tag" color="#1E8A4F" size={13} />
              <AppText variant="caption" color="#1E8A4F" numberOfLines={1} style={{ flexShrink: 1 }}>
                {q?.code ? t("cpLine", { code: q.code }) : q?.title}
              </AppText>
            </View>
            <AppText variant="bodyBold" color="#1E8A4F" style={{ fontSize: 13 }}>− ₹ {bill.discount}</AppText>
          </View>
        )}
        <View style={row}>
          <AppText variant="caption" muted>{t("deliveryFee")}</AppText>
          {bill.delivery === 0 && bill.freeAbove != null && bill.itemTotal >= bill.freeAbove ? (
            <AppText variant="caption" color={c.successText}>{t("freeAbove", { n: bill.freeAbove })}</AppText>
          ) : bill.delivery === 0 ? (
            <AppText variant="caption" color={c.successText}>{t("free")}</AppText>
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
        {bill.belowMin && (
          <AppText variant="caption" color={c.price} numberOfLines={2} style={{ lineHeight: 16 }}>{t("groceryBelowMin", { n: bill.minOrder - bill.itemTotal })}</AppText>
        )}
        <AppText variant="caption" muted numberOfLines={2} style={{ lineHeight: 16 }}>{t(bill.vertical === "grocery" ? "groceryNote" : "weightNote")}</AppText>
      </View>
    </View>
  );
}
