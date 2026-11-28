import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type DealerMe = { id: string; shop_name: string; store_type?: "meat" | "grocery"; is_open: boolean; closed_until: string | null; /** What the shop gives the app per order (null = nothing). */ app_charge?: { mode: "percent" | "flat"; value: number; basis: string } | null };

export type DealerOrderItem = {
  id: string;
  product_id: string;
  requested_kg: number;
  actual_kg: number | null;
  size: string | null;
  notes: string | null;
  unavailable: boolean;
  shop_price_per_kg: number;
  /** Scale photo already uploaded for this item (storage path), if any. */
  photo_path: string | null;
  /** A free item from one of the shop's own offers: the shop gets nothing for it. */
  is_free?: boolean;
  /** Picture, brand and pack size come with newer servers; grocery lines carry brand and pack size. */
  products: { name: string; name_ta: string | null; unit: "kg" | "piece"; image_path?: string | null; brand?: string | null; pack_size?: string | null; mrp?: number | null };
};

export type RiderInfo = { name: string | null; phone: string | null; vehicle: string | null };

export type DealerOrder = {
  id: string;
  display_id: string;
  status: "DEALER_ASSIGNED" | "ACCEPTED" | "PACKING" | "PACKED" | "RIDER_ASSIGNED";
  /** meat (cut · weigh · pack) or grocery (pack while the rider comes). */
  vertical_type?: "meat" | "grocery";
  /** Set once a rider has accepted the pickup. */
  rider: RiderInfo | null;
  ready_by: string | null;
  /** Customer added items after placing (null when the order is as placed). */
  items_added_at: string | null;
  accept_deadline: string | null;
  created_at: string;
  delivery_slots: { starts_at: string; ends_at: string } | null;
  order_items: DealerOrderItem[];
  /** What the shop gives Thanjoz Mart for this order (grocery; a preview until accepted). */
  app_charge?: number;
  /** The rule behind it, e.g. "3%" or "₹10". */
  app_charge_basis?: string | null;
  /** A next-order coupon the shop gave, used on this order: it comes off the shop's amount. */
  offer_discount?: number;
};

const STAGE: Record<DealerOrder["status"], number> = { DEALER_ASSIGNED: 0, ACCEPTED: 1, PACKING: 2, PACKED: 3, RIDER_ASSIGNED: 4 };
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : Infinity);

/**
 * Most urgent first: new offers before work in hand before ready; among new
 * ones the order waiting longest, among the rest the earliest promised ready
 * time, then the oldest order.
 */
export function byUrgency(a: DealerOrder, b: DealerOrder) {
  return (
    STAGE[a.status] - STAGE[b.status] ||
    (a.status === "DEALER_ASSIGNED" ? 0 : ms(a.ready_by) - ms(b.ready_by)) ||
    ms(a.created_at) - ms(b.created_at)
  );
}

export function useDealerMe() {
  return useQuery<DealerMe>({ queryKey: ["dealer", "me"], queryFn: () => api("/dealer/me"), retry: false });
}

/** The shop's open orders (15 s poll; `useDealerRealtime` refreshes instantly). */
export function useDealerOrders(dealerId: string | undefined) {
  return useQuery<DealerOrder[]>({
    queryKey: ["dealer", "orders"],
    enabled: !!dealerId,
    refetchInterval: 15_000,
    queryFn: () => api("/dealer/orders"),
  });
}

/**
 * One realtime subscription for the whole app (mount it once, in the tab
 * layout): any change to this shop's orders refreshes orders, summary and
 * history. Supabase refuses a second subscription on the same channel name,
 * so this must not be called from individual screens.
 */
export function useDealerRealtime(dealerId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!dealerId) return;
    const channel = supabase
      .channel(`dealer-${dealerId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `dealer_id=eq.${dealerId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dealer", "orders"] });
        qc.invalidateQueries({ queryKey: ["dealer", "summary"] });
        qc.invalidateQueries({ queryKey: ["dealer", "history"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealerId]);
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["dealer", "orders"] });
  qc.invalidateQueries({ queryKey: ["dealer", "summary"] });
}

export function useAccept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; readyMinutes?: number }) => api("/dealer/orders/accept", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; reason: string }) => api("/dealer/orders/reject", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useStartCutting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api(`/dealer/orders/${orderId}/start-cutting`, { method: "POST" }),
    onSettled: () => invalidate(qc),
  });
}

export function useItemPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; orderItemId: string; photoPath: string }) => api("/dealer/orders/item-photo", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useWeigh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; orderItemId: string; actualQty: number }) => api("/dealer/orders/weigh", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function usePacked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api(`/dealer/orders/${orderId}/packed`, { method: "POST" }),
    onSettled: () => invalidate(qc),
  });
}

export function useShopState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { isOpen?: boolean; closedUntil?: string | null }) => api("/dealer/shop", { method: "POST", body: p }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["dealer", "me"] }),
  });
}

export type Summary = { newCount: number; inProgressCount: number; readyCount: number; todayOrders: number; todaySales: number; todayItems?: number; todayAppCharge?: number; todayOfferDiscount?: number };

export function useSummary(dealerId: string | undefined) {
  return useQuery<Summary>({ queryKey: ["dealer", "summary"], enabled: !!dealerId, refetchInterval: 30_000, queryFn: () => api("/dealer/summary") });
}

export type HistoryRow = { id: string; display_id: string; status: string; created_at: string; shop_amount: number; app_charge?: number; offer_discount?: number; items: { name: string; name_ta: string | null }[] };

export function useHistory(dealerId: string | undefined) {
  return useQuery<HistoryRow[]>({ queryKey: ["dealer", "history"], enabled: !!dealerId, queryFn: () => api("/dealer/history") });
}

type Group = { name: string; name_ta: string | null; sort: number; image_path?: string | null };
/** `product_id` is the meat product, or the master product for a grocery shop. `detail` is the brand and pack size of a grocery item. */
export type StockRow = { product_id: string; name: string; name_ta: string | null; unit: string; image_path: string | null; out_of_stock_until: string | null; category: Group; subcategory: Group | null; detail?: string;
  /** Grocery listings only: the three prices, and whether the shop has hidden it from customers. */
  prices?: { mrp: number | null; selling: number; shop: number };
  hidden?: boolean;
};

const OTHER: Group = { name: "Other", name_ta: null, sort: 99 };
const byGroup = (a: StockRow, b: StockRow) => a.category.sort - b.category.sort || (a.subcategory?.sort ?? 0) - (b.subcategory?.sort ?? 0) || a.name.localeCompare(b.name);

/**
 * The shop's product list with stock state (read straight from Supabase).
 * A meat shop lists in dealer_products, a grocery shop in store_products;
 * a shop only has rows in its own table, so both are read and joined.
 */
export function useStock(dealerId: string | undefined) {
  return useQuery<StockRow[]>({
    queryKey: ["dealer", "stock"],
    enabled: !!dealerId,
    queryFn: async () => {
      const [meat, grocery] = await Promise.all([
        supabase
          .from("dealer_products")
          .select("product_id, out_of_stock_until, products(name, name_ta, unit, image_path, categories(name, name_ta, sort), subcategories(name, name_ta, sort, image_path))")
          .eq("dealer_id", dealerId!),
        supabase
          .from("store_products")
          .select("master_product_id, out_of_stock_until, shop_price, selling_price, mrp, is_active, master_products(name, name_ta, unit, brand, pack_size, image_path, catalog_categories(name, name_ta, sort, image_path, parent:parent_id(name, name_ta, sort, image_path)))")
          .eq("dealer_id", dealerId!),
      ]);
      if (meat.error) throw meat.error;
      if (grocery.error) throw grocery.error;
      const meatRows: StockRow[] = (meat.data ?? []).map((r) => {
        const p = r.products as unknown as { name: string; name_ta: string | null; unit: string; image_path: string | null; categories: Group | null; subcategories: Group | null };
        return {
          product_id: r.product_id,
          out_of_stock_until: r.out_of_stock_until,
          name: p.name,
          name_ta: p.name_ta,
          unit: p.unit,
          image_path: p.image_path,
          category: p.categories ?? OTHER,
          subcategory: p.subcategories,
        };
      });
      const groceryRows: StockRow[] = (grocery.data ?? []).flatMap((r) => {
        const p = r.master_products as unknown as { name: string; name_ta: string | null; unit: string; brand: string | null; pack_size: string | null; image_path: string | null; catalog_categories: (Group & { parent: Group | null }) | null } | null;
        if (!p) return [];
        // Two-level tree: the top level heads the section, the second level is the sub-heading.
        const cat = p.catalog_categories;
        return [{
          product_id: r.master_product_id,
          out_of_stock_until: r.out_of_stock_until,
          name: p.name,
          name_ta: p.name_ta,
          unit: p.unit,
          image_path: p.image_path,
          category: cat?.parent ?? cat ?? OTHER,
          subcategory: cat?.parent ? cat : null,
          detail: [p.brand, p.pack_size].filter(Boolean).join(" · ") || undefined,
          prices: { mrp: r.mrp == null ? null : Number(r.mrp), selling: Number(r.selling_price), shop: Number(r.shop_price) },
          hidden: !r.is_active,
        }];
      });
      return [...meatRows, ...groceryRows].sort(byGroup);
    },
  });
}

export function useSetStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { productId: string; outOfStockUntil: string | null }) => api("/dealer/stock", { method: "POST", body: p }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["dealer", "stock"] }),
  });
}

// ───────────── grocery shop: its own products and prices ─────────────
export type CatalogCategory = { id: string; parent_id: string | null; name: string; name_ta: string | null; sort: number };
export type MyListing = {
  master_product_id: string;
  shop_price: number;
  selling_price: number;
  mrp: number | null;
  selling_set_by: "store" | "admin";
  is_active: boolean;
  product: {
    id: string; name: string; name_ta: string | null; brand: string | null; pack_size: string | null; unit: "piece" | "pack" | "kg";
    category_id: string | null; image_path: string | null; description: string | null; description_ta: string | null;
    scope: "shared" | "store"; owner_dealer_id: string | null;
  };
};
export type ProductDetails = {
  name: string; nameTa: string | null; brand: string | null; description: string | null; descriptionTa: string | null;
  categoryId: string | null; unit: "piece" | "pack" | "kg"; packSize: string | null; mrp: number; shopPrice: number; sellingPrice: number;
};

/** The shop's listings with full product details, for the edit form. */
export function useMyListings(enabled = true) {
  return useQuery<MyListing[]>({ queryKey: ["dealer", "catalog"], enabled, queryFn: () => api("/dealer/catalog") });
}

export function useCatalogCategories() {
  return useQuery<CatalogCategory[]>({ queryKey: ["dealer", "catalogCategories"], staleTime: 10 * 60_000, queryFn: () => api("/dealer/catalog/categories") });
}

/** Add, edit, show/hide a product and set its photo. Each refreshes the stock list. */
export function useProductActions() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ["dealer", "stock"] }), qc.invalidateQueries({ queryKey: ["dealer", "catalog"] })]);
  const mode = (d: { shopPrice: number; sellingPrice: number }) => (d.sellingPrice === d.shopPrice ? "same" : "custom");
  return {
    create: async (d: ProductDetails) => {
      const r = await api<{ product: { id: string } }>("/dealer/catalog/custom", { method: "POST", body: { ...d, priceMode: mode(d) } });
      return r.product.id;
    },
    updateOwn: (id: string, d: ProductDetails) => api(`/dealer/catalog/${id}/product`, { method: "PATCH", body: d }),
    /** A catalogue product: the shop sets its prices only. */
    setPrices: (id: string, d: { shopPrice: number; sellingPrice?: number }) =>
      api(`/dealer/catalog/${id}`, { method: "PATCH", body: d.sellingPrice === undefined ? { shopPrice: d.shopPrice } : { ...d, priceMode: mode({ shopPrice: d.shopPrice, sellingPrice: d.sellingPrice }) } }),
    setActive: (id: string, isActive: boolean) => api(`/dealer/catalog/${id}`, { method: "PATCH", body: { isActive } }),
    setPhoto: (id: string, file: { uri: string; name: string; type: string }) => apiUpload(`/dealer/catalog/${id}/image`, file),
    removePhoto: (id: string) => api(`/dealer/catalog/${id}/image`, { method: "DELETE" }),
    done,
  };
}

// ───────────── grocery shop: offers for customers ─────────────
export type OfferKind = "price" | "bogo" | "free_gift" | "next_order";
export type OfferScope = "product" | "products" | "category";
export type OfferState = "waiting" | "rejected" | "off" | "scheduled" | "live" | "ended";
export type ShopOffer = {
  id: string;
  kind: OfferKind;
  productId: string | null;
  product: { name: string; nameTa: string | null; imagePath: string | null; packSize: string | null; mrp: number | null } | null;
  /** Price and buy-get-free offers: one product, chosen products, or a whole category. */
  scope: OfferScope;
  productIds: string[] | null;
  category: { id: string; name: string; nameTa: string | null } | null;
  pct: number | null;
  buyQty: number | null;
  /** Buy-and-get-free on many products: any mix counts, not each product on its own. */
  mix?: boolean;
  /** The card colour; null wears the kind's own colour. */
  color?: string | null;
  freeQty: number | null;
  minOrder: number | null;
  maxDiscount: number | null;
  validDays: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  status: "pending" | "approved" | "rejected";
  state: OfferState;
  rejectReason: string | null;
  /** The offer's own banner picture; without one the product photo is shown. */
  bannerPath: string | null;
  /** 'app': Thanjoz Mart made this offer and pays for it; the shop cannot change it. */
  paidBy: "shop" | "app";
  /** Price offers: today's customer price and shop amount, before and during the offer. */
  priceNow: { usual: number; offer: number; shopUsual: number; shopGets: number } | null;
  /** What the offer has done so far; `given` is the rupees it has cost the shop. */
  stats: { orders: number; freeUnits: number; couponsGiven: number; couponsUsed: number; given: number };
};
export type ShopOfferInput = {
  kind: OfferKind;
  masterProductId?: string | null;
  scope?: OfferScope;
  productIds?: string[] | null;
  categoryId?: string | null;
  pct?: number | null;
  buyQty?: number | null;
  freeQty?: number | null;
  mix?: boolean;
  color?: string | null;
  minOrder?: number | null;
  maxDiscount?: number | null;
  validDays?: number | null;
  startsAt: string;
  endsAt: string;
};

export function useShopOffers(enabled = true) {
  return useQuery<ShopOffer[]>({ queryKey: ["dealer", "offers"], enabled, queryFn: () => api("/dealer/offers") });
}

/** Make, change, switch on/off or end an offer. A new or changed offer waits for Thanjoz Mart to approve it. */
export function useOfferActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["dealer", "offers"] });
  return {
    save: (input: ShopOfferInput, id?: string) => api<{ id: string }>(id ? `/dealer/offers/${id}` : "/dealer/offers", { method: "POST", body: input }),
    setActive: (id: string, active: boolean) => api(`/dealer/offers/${id}/active`, { method: "POST", body: { active } }),
    end: (id: string) => api(`/dealer/offers/${id}/end`, { method: "POST" }),
    setBanner: (id: string, file: { uri: string; name: string; type: string }) => apiUpload(`/dealer/offers/${id}/image`, file),
    removeBanner: (id: string) => api(`/dealer/offers/${id}/image`, { method: "DELETE" }),
    done,
  };
}
