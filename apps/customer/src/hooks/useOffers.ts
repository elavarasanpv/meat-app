import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAddresses } from "@/hooks/useOrders";
import type { CartItem } from "@/store/cart";

export type LiveOffer = {
  id: string;
  kind: "banner" | "coupon";
  code: string | null;
  title: string;
  titleTa: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  tint: string | null;
  discountType: "percent" | "flat";
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number | null;
  endsAt: string;
  /** Products it covers; [] = everything. */
  products: string[];
};

export type Quote = {
  discount: number;
  offerId: string | null;
  title: string | null;
  code: string | null;
  couponBeaten: boolean;
  couponRejected: { reason: "not_found" | "not_live" | "min_order" | "first_order_only" | "already_used" | "fully_used" | "not_in_scope" | "pincode"; minOrder?: number } | null;
};

/** Pincode of the customer's default (newest) address, for area-only offers. */
export function useHomePincode() {
  const a = useAddresses();
  return a.data?.[0]?.pincode as string | undefined;
}

export function useLiveOffers() {
  const pincode = useHomePincode();
  return useQuery({
    queryKey: ["offers", pincode ?? "any"],
    queryFn: () => api<LiveOffer[]>(`/offers${pincode ? `?pincode=${pincode}` : ""}`),
    staleTime: 60_000,
  });
}

/** Banner offer (no code) that covers this product, for the "20% OFF" tag. */
export function useOfferForProduct() {
  const offers = useLiveOffers().data ?? [];
  const banners = offers.filter((o) => o.kind === "banner");
  return (productId: string) => banners.find((o) => !o.products.length || o.products.includes(productId)) ?? null;
}

/** Server preview of the best discount for this cart (+ typed coupon). The order re-checks it. */
export function useOfferQuote(items: CartItem[], coupon: string | null, pincode?: string) {
  const key = items.map((i) => `${i.productId}:${i.qty}`).sort().join(",");
  return useQuery({
    queryKey: ["offer-quote", key, coupon ?? "", pincode ?? ""],
    queryFn: () =>
      api<Quote>("/offers/quote", {
        method: "POST",
        body: { items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })), couponCode: coupon ?? undefined, pincode },
      }),
    enabled: items.length > 0,
    staleTime: 30_000,
  });
}

export const offerTag = (o: Pick<LiveOffer, "discountType" | "discountValue">) => (o.discountType === "percent" ? `${o.discountValue}% OFF` : `₹${o.discountValue} OFF`);
