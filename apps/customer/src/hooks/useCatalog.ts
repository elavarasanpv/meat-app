import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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

export function useProducts(categoryId?: string | null) {
  return useQuery({
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
}

export type ProductStat = { product_id: string; avg_stars: number | null; rating_count: number; customers: number };

/** Stars and how many customers bought each product; drives card badges and "popular first" order. */
export function useProductStats() {
  return useQuery({
    queryKey: ["product_stats"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_stats").select("product_id, avg_stars, rating_count, customers");
      if (error) throw error;
      const m = new Map<string, ProductStat>();
      for (const row of data as ProductStat[]) m.set(row.product_id, { ...row, avg_stars: row.avg_stars == null ? null : Number(row.avg_stars), rating_count: Number(row.rating_count), customers: Number(row.customers) });
      return m;
    },
  });
}

/** Most-bought first (by number of customers), then by name; keeps the list stable before stats load. */
export function byPopularity<T extends { id: string; name: string }>(items: T[], stats?: Map<string, ProductStat>): T[] {
  if (!stats) return items;
  return [...items].sort((a, b) => (stats.get(b.id)?.customers ?? 0) - (stats.get(a.id)?.customers ?? 0) || a.name.localeCompare(b.name));
}
