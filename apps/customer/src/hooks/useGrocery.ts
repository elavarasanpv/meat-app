import { useEffect } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ShopOfferKind } from "@thanjozmart/shared";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { FeeRule } from "@/store/cart";
import { useDeliveryTerms } from "@/hooks/useDelivery";
import { useSelectedAddress } from "@/hooks/useOrders";

/**
 * Grocery vertical (G2). Everything here is empty/false until the admin
 * switches `verticals.grocery` on — RLS and the definer-rights lookups
 * (grocery_catalog, grocery_fee) both key on that flag, so the app needs no
 * build to go live. The customer never sees a shop: the catalog is whatever
 * the shops serving their address list, and checkout picks the shop(s).
 */

/** True once customers may see grocery. Re-checked each minute and on foreground. */
export function useGroceryLive(): boolean {
  const q = useQuery({
    queryKey: ["verticals", "grocery"],
    staleTime: 60_000,
    // Home stays mounted, so poll: an admin switching grocery on shows up within a minute.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("verticals").select("is_active").eq("type", "grocery").maybeSingle();
      if (error) throw error;
      return !!data?.is_active;
    },
  });
  // …and straight away when the customer comes back to the app.
  const { refetch } = q;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && void refetch());
    return () => sub.remove();
  }, [refetch]);
  return q.data === true;
}

/** Delivery rule for the pincode: min order, fee, free-above. Null when grocery has no rule. */
export function useGroceryFee(pincode?: string) {
  return useDeliveryTerms("grocery", pincode);
}

export type GroceryCategory = { id: string; parent_id: string | null; name: string; name_ta: string | null; image_path: string | null; sort: number };

export function useGroceryCategories() {
  return useQuery({
    queryKey: ["grocery", "categories"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("catalog_categories").select("id, parent_id, name, name_ta, image_path, sort").eq("vertical_type", "grocery").eq("is_active", true).order("sort");
      if (error) throw error;
      return data as GroceryCategory[];
    },
  });
}

/** One row per item some shop serving the pincode sells; price = cheapest in-stock listing. */
export type GroceryItem = {
  master_product_id: string;
  name: string;
  name_ta: string | null;
  brand: string | null;
  pack_size: string | null;
  unit: "piece" | "pack" | "kg";
  min_qty: number;
  qty_step: number;
  image_path: string | null;
  category_id: string | null;
  selling_price: number;
  mrp: number | null;
  in_stock: boolean;
  shops: number;
  /** Backdrop the admin picked for the photo; absent until the catalogue carries it. */
  card_bg?: string | null;
  /** A shop's price offer is on: the % off printed on the badge (selling_price is already the offer price). */
  offer_pct?: number | null;
  /** Buy this many… */
  bogo_buy?: number | null;
  /** …and get this many free. */
  bogo_free?: number | null;
  /** The buy-and-get-free offer counts any mix of its products. */
  bogo_mix?: boolean | null;
};

/** The offer badge for a card, when the item has one: "50% OFF" or "1 + 1 FREE". */
export function offerBadge(r: Pick<GroceryItem, "offer_pct" | "bogo_buy" | "bogo_free">): { kind: "price" | "bogo"; buy: number; free: number; pct: number } | null {
  if (r.bogo_buy && r.bogo_free) return { kind: "bogo", buy: Number(r.bogo_buy), free: Number(r.bogo_free), pct: 0 };
  if (r.offer_pct) return { kind: "price", buy: 0, free: 0, pct: Math.round(Number(r.offer_pct)) };
  return null;
}

/**
 * Everything a customer at this address can buy (empty while the vertical is
 * off): what the shops with the pincode on their list, or within 5 km, sell.
 */
export function useGroceryCatalog(pincode?: string) {
  const a = useSelectedAddress();
  const pin = a && a.pincode === pincode ? { lat: a.lat, lng: a.lng } : { lat: null, lng: null };
  return useQuery({
    queryKey: ["grocery", "catalog", pincode ?? "none", pin.lat, pin.lng],
    enabled: !!pincode,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("grocery_catalog", { p_pincode: pincode, p_lat: pin.lat, p_lng: pin.lng });
      if (error) throw error;
      return (data as GroceryItem[]).map((r) => ({
        ...r,
        selling_price: Number(r.selling_price),
        mrp: r.mrp == null ? null : Number(r.mrp),
        min_qty: Number(r.min_qty),
        qty_step: Number(r.qty_step),
        shops: Number(r.shops),
      }));
    },
  });
}

/** The admin's description for one item (the catalog list carries price and stock). */
export function useGroceryItem(id?: string) {
  return useQuery({
    queryKey: ["grocery", "item", id ?? "none"],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("master_products").select("id, description, description_ta").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; description: string | null; description_ta: string | null } | null;
    },
  });
}

/** Master ids this customer has had delivered, newest first, each once. Empty for a first-time buyer. */
export function useGroceryBought() {
  // Keyed and gated on the user: a query fired before the session restores would cache an empty anonymous answer.
  const userId = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ["grocery", "bought", userId ?? "anon"],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, order_items(master_product_id)")
        .eq("vertical_type", "grocery")
        .eq("status", "DELIVERED")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const o of (data ?? []) as { order_items: { master_product_id: string | null }[] }[]) {
        for (const it of o.order_items) {
          if (it.master_product_id && !seen.has(it.master_product_id)) {
            seen.add(it.master_product_id);
            ids.push(it.master_product_id);
          }
        }
      }
      return ids;
    },
  });
}

/** A shop offer the customer can use at this address. Never says which shop. */
export type GroceryOffer = {
  id: string;
  kind: ShopOfferKind;
  pct: number | null;
  buy_qty: number | null;
  free_qty: number | null;
  min_order: number | null;
  max_discount: number | null;
  valid_days: number | null;
  ends_at: string;
  master_product_id: string | null;
  name: string | null;
  name_ta: string | null;
  pack_size: string | null;
  image_path: string | null;
  card_bg: string | null;
  mrp: number | null;
  price: number | null;
  was_price: number | null;
  /** Price and buy-get-free offers: on one product, on chosen products, or on a category. */
  scope: "product" | "products" | "category";
  category_id: string | null;
  category_name: string | null;
  category_name_ta: string | null;
  /** The offer's own picture; without one the product photo stands in. */
  banner_path?: string | null;
  /** Buy-and-get-free that counts any mix of its products together. */
  mix?: boolean | null;
  /** The card colour the offer chose; empty wears the kind's own. */
  color?: string | null;
  /** Many-product offers: the products it really covers at this address. */
  product_ids: string[] | null;
};
/** An offer on many products: its card opens a list, not one product. */
export const offerIsMany = (o: Pick<GroceryOffer, "kind" | "scope">) => (o.kind === "price" || o.kind === "bogo") && (o.scope === "products" || o.scope === "category");

/** Live shop offers for the address (the strip on grocery Home). Empty on any error: offers are a bonus. */
export function useGroceryOffers(pincode?: string) {
  const a = useSelectedAddress();
  const pin = a && a.pincode === pincode ? { lat: a.lat, lng: a.lng } : { lat: null, lng: null };
  return useQuery({
    queryKey: ["grocery", "offers", pincode ?? "none", pin.lat, pin.lng],
    enabled: !!pincode,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("grocery_live_offers", { p_pincode: pincode, p_lat: pin.lat, p_lng: pin.lng });
      if (error) return [] as GroceryOffer[];
      const num = (v: unknown) => (v == null ? null : Number(v));
      return ((data ?? []) as GroceryOffer[])
        .map((o) => ({ ...o, scope: o.scope ?? "product", pct: num(o.pct), min_order: num(o.min_order), max_discount: num(o.max_discount), mrp: num(o.mrp), price: num(o.price), was_price: num(o.was_price) }))
        .filter((o) => !offerIsMany(o) || !!o.product_ids?.length);
    },
  });
}

/** What the shop offers do to this basket: free items, the coupon used, the coupon earned. */
export type GroceryQuote = {
  free: { masterProductId: string; name: string; nameTa: string | null; imagePath: string | null; qty: number; reason: "bogo" | "gift"; value: number }[];
  giftHint: { need: number; minOrder: number; name: string; nameTa: string | null; imagePath: string | null } | null;
  coupon: { id: string; pct: number; maxDiscount: number; discount: number; expiresAt: string } | null;
  earns: { pct: number; maxDiscount: number; validDays: number } | null;
  earnHint: { need: number; pct: number; maxDiscount: number } | null;
  saved: number;
};

export function useGroceryQuote(addressId: string | undefined, items: { productId: string; qty: number }[], enabled = true) {
  const key = items.map((i) => `${i.productId}:${i.qty}`).sort().join(",");
  return useQuery({
    queryKey: ["grocery", "offer-quote", addressId ?? "none", key],
    enabled: enabled && !!addressId && items.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => api<GroceryQuote>("/grocery/offers/quote", { method: "POST", body: { addressId, items: items.map((i) => ({ masterProductId: i.productId, qty: i.qty })) } }),
  });
}
