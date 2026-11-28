import { View } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useBasketTerms } from "@/hooks/useDelivery";
import { useGroceryQuote } from "@/hooks/useGrocery";
import { useOfferQuote } from "@/hooks/useOffers";
import { useSelectedAddress } from "@/hooks/useOrders";
import { BasketPerks, FreeLines } from "./GroceryOffers";
import { CouponCard } from "./CouponCard";
import { cartTotals, cartVertical, useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Bill with the best offer applied and a coupon box. The amount here is a
 * server preview; the order is re-priced on the server when it's placed.
 * Returns the total so the caller can put it on its button.
 */
export function useBill(pincode?: string, addressId?: string) {
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const vertical = cartVertical(items);
  // Offers are meat-only for now; a grocery basket never asks for a quote.
  const quote = useOfferQuote(items, coupon, pincode, vertical === "meat");
  // The terms for the address being checked out; the kept copy covers the moment before the lookup answers.
  const totals = cartTotals(items, useBasketTerms(vertical, pincode));
  // Grocery: the shop offers on this basket (free items, the customer's own coupon, what the order earns).
  const chosen = useSelectedAddress();
  const shopOffers = useGroceryQuote(addressId ?? chosen?.id, items, vertical === "grocery").data;
  const gq = vertical === "grocery" && items.length > 0 ? shopOffers : undefined;
  const discount = vertical === "meat" ? quote.data?.discount ?? 0 : Math.min(gq?.coupon?.discount ?? 0, totals.itemTotal);
  return { ...totals, vertical, discount, toPay: totals.itemTotal - discount + totals.delivery, quote: vertical === "meat" ? quote.data : undefined, quoting: vertical === "meat" && quote.isFetching, shopOffers: gq };
}


export function BillSummary({ bill }: { bill: ReturnType<typeof useBill> }) {
  const { c } = useTheme();
  const t = useT();
  const q = bill.quote;
  const row = { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
  return (
    <View style={{ gap: 12 }}>
      {bill.vertical === "meat" && <CouponCard quote={q} quoting={bill.quoting} />}
      {bill.shopOffers?.free.length ? (
        <View style={{ paddingTop: 12, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
          <FreeLines quote={bill.shopOffers} />
        </View>
      ) : null}
      <BasketPerks quote={bill.shopOffers} />
      <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 8 }}>
        <View style={row}>
          <AppText variant="caption" muted>{t("itemTotal")}</AppText>
          <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {bill.itemTotal}</AppText>
        </View>
        {bill.discount > 0 && (
          <View style={row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Icon name="tag" color={c.success} size={13} />
              <AppText variant="caption" color={c.success} numberOfLines={1} style={{ flexShrink: 1 }}>
                {bill.shopOffers?.coupon ? t("go_couponLine", { n: bill.shopOffers.coupon.pct }) : q?.code ? t("cpLine", { code: q.code }) : q?.title}
              </AppText>
            </View>
            <AppText variant="bodyBold" color={c.success} style={{ fontSize: 13 }}>− ₹ {bill.discount}</AppText>
          </View>
        )}
        <View style={row}>
          <AppText variant="caption" muted>{t("deliveryFee")}</AppText>
          {bill.firstFree ? (
            <AppText variant="caption" color={c.successText}>{t("free")}</AppText>
          ) : bill.delivery === 0 && bill.freeAbove != null && bill.itemTotal >= bill.freeAbove ? (
            <AppText variant="caption" color={c.successText}>{t("freeAbove", { n: bill.freeAbove })}</AppText>
          ) : bill.delivery === 0 ? (
            <AppText variant="caption" color={c.successText}>{t("free")}</AppText>
          ) : (
            <AppText variant="bodyBold" style={{ fontSize: 13 }}>₹ {bill.delivery}</AppText>
          )}
        </View>
        {bill.firstFree ? (
          <AppText variant="caption" color={c.successText} style={{ lineHeight: 16 }}>{t("firstOrderFree")}</AppText>
        ) : bill.delivery > 0 && bill.freeAbove != null && !bill.belowMin ? (
          <AppText variant="caption" color={c.price} style={{ lineHeight: 16 }}>{t("addMoreFree", { n: bill.freeAbove - bill.itemTotal })}</AppText>
        ) : null}
        <View style={{ height: 1, backgroundColor: c.border }} />
        <View style={row}>
          <AppText variant="bodyBold">{t("toPay")}</AppText>
          <AppText variant="price" color={c.price} style={{ fontSize: 20, lineHeight: 25 }}>₹ {bill.toPay}</AppText>
        </View>
        {bill.discount > 0 && (
          <View style={{ alignSelf: "flex-start", backgroundColor: c.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <AppText variant="label" color={c.successText} style={{ fontSize: 11.5 }}>{t("youSave", { amt: bill.discount })}</AppText>
          </View>
        )}
        {bill.belowMin && (
          <AppText variant="caption" color={c.danger} style={{ lineHeight: 16 }}>{t("addMoreToOrder", { n: bill.minOrder - bill.itemTotal, min: bill.minOrder })}</AppText>
        )}
        <AppText variant="caption" muted style={{ lineHeight: 16 }}>{t(bill.vertical === "grocery" ? "groceryNote" : "weightNote")}</AppText>
      </View>
    </View>
  );
}
