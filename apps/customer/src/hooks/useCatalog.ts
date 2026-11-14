import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAddresses } from "./useOrders";

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
  const pincode = useAddresses().data?.[0]?.pincode;
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

export function useProducts(categoryId?: string | null) {
  const prices = useSellPrices().data;
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
  const data = useMemo(
    () => (q.data && prices && Object.keys(prices).length ? q.data.map((p) => (prices[p.id] != null ? { ...p, base_price_per_kg: prices[p.id] } : p)) : q.data),
    [q.data, prices],
  );
  return { ...q, data };
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
