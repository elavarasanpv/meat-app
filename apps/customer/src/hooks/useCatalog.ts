import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSelectedAddress } from "./useOrders";

export type Category = { id: string; name: string; name_ta: string | null; sort: number };
export type ProductUnit = "kg" | "piece";
export type Product = {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  name_ta: string | null;
  base_price_per_kg: number; // price per unit (kg or piece)
  unit: ProductUnit;
  image_path: string | null;
};

export type Subcategory = {
  id: string;
  category_id: string;
  name: string;
  name_ta: string | null;
  image_path: string | null;
  sort: number;
};

export function useSubcategories() {
  return useQuery({
    queryKey: ["subcategories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategories")
        .select("id, category_id, name, name_ta, image_path, sort")
        .eq("is_active", true)
        .order("sort");
      if (error) throw error;
      return data as Subcategory[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_ta, sort")
        .eq("is_active", true)
        .order("sort");
      if (error) throw error;
      return data as Category[];
    },
  });
}

/**
 * Selling-price overrides for the customer's pincode: admin can price an
 * area differently; everywhere else sees the default product price.
 */
export function useSellPrices() {
  const pincode = useSelectedAddress()?.pincode;
  return useQuery({
    queryKey: ["sell_prices", pincode ?? "none"],
    enabled: !!pincode,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_prices").select("product_id, price_per_kg").eq("pincode", pincode!);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of data) out[r.product_id] = Number(r.price_per_kg);
      return out;
    },
  });
}

/**
 * Meat products the shops serving the chosen address list. A shop serves an
 * address when the pincode is on its list or it is within 5 km (meat_catalog()).
 */
export function useMeatRegion() {
  return useMeatArea((d) => d.ids);
}

/**
 * True when shops serve the chosen address but cannot take the order right
 * now (closed, or out of stock): for a basket, when any of its items is not
 * available now; with no basket, when nothing is. The order can still be
 * placed; it goes to the shop when it opens.
 */
export function useShopsClosed(productIds?: string[]): boolean {
  const d = useMeatArea((x) => x).data;
  if (!d || !d.ids.length) return false;
  if (!productIds?.length) return d.live.length === 0;
  const here = productIds.filter((id) => d.ids.includes(id));
  return here.some((id) => !d.live.includes(id));
}

/** ids: what shops near the address list. live: the ones an open shop has in stock now. */
type MeatArea = { ids: string[]; live: string[] };
function useMeatArea<T>(select: (d: MeatArea) => T) {
  const a = useSelectedAddress();
  return useQuery({
    queryKey: ["meat", "area2", a?.pincode ?? "none", a?.lat ?? null, a?.lng ?? null],
    enabled: !!a,
    staleTime: 60_000,
    queryFn: async (): Promise<MeatArea> => {
      const { data, error } = await supabase.rpc("meat_catalog", { p_pincode: a!.pincode, p_lat: a!.lat, p_lng: a!.lng });
      if (error) throw error;
      const rows = data as { product_id: string; in_stock: boolean }[];
      return { ids: rows.map((r) => r.product_id), live: rows.filter((r) => r.in_stock).map((r) => r.product_id) };
    },
    select,
  });
}

/** Active meat products, narrowed to what the customer's area sells once an address is chosen. */
export function useProducts(categoryId?: string | null) {
  const prices = useSellPrices().data;
  const hasAddress = !!useSelectedAddress();
  const region = useMeatRegion();
  const q = useQuery({
    queryKey: ["products", categoryId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, category_id, subcategory_id, name, name_ta, base_price_per_kg, unit, image_path")
        .eq("is_active", true)
        .order("name");
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
  });
  // overlay the pincode's prices so every screen shows what this customer pays
  const priced = useMemo(
    () => (q.data && prices && Object.keys(prices).length ? q.data.map((p) => (prices[p.id] != null ? { ...p, base_price_per_kg: prices[p.id] } : p)) : q.data),
    [q.data, prices],
  );
  // Only what shops in this customer's area list. No address yet (or the
  // area lookup failed): the whole list; checkout still checks the address.
  const waiting = hasAddress && region.data === undefined && !region.isError;
  const data = useMemo(() => {
    if (waiting) return undefined;
    if (!priced || !hasAddress || !region.data) return priced;
    const here = new Set(region.data);
    return priced.filter((p) => here.has(p.id));
  }, [priced, hasAddress, region.data, waiting]);
  return { ...q, data, isLoading: q.isLoading || (waiting && region.isLoading), refetch: () => { void region.refetch(); return q.refetch(); } };
}

export type ProductStat = { product_id: string; avg_stars: number | null; rating_count: number; customers: number };

/** Product id → stats. A plain object, not a Map: the query cache is saved to the phone as JSON. */
export type ProductStats = Record<string, ProductStat>;

/** Stars and how many customers bought each product; drives "most bought first" and the product page. */
export function useProductStats() {
  return useQuery({
    queryKey: ["product_stats", "v2"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_stats").select("product_id, avg_stars, rating_count, customers");
      if (error) throw error;
      const out: ProductStats = {};
      for (const row of data as ProductStat[]) out[row.product_id] = { ...row, avg_stars: row.avg_stars == null ? null : Number(row.avg_stars), rating_count: Number(row.rating_count), customers: Number(row.customers) };
      return out;
    },
  });
}

/** Most-bought first (by number of customers), then by name; keeps the list as-is before stats load. */
export function byPopularity<T extends { id: string; name: string }>(items: T[], stats?: ProductStats): T[] {
  if (!stats || typeof stats !== "object") return items;
  return [...items].sort((a, b) => (stats[b.id]?.customers ?? 0) - (stats[a.id]?.customers ?? 0) || a.name.localeCompare(b.name));
}
