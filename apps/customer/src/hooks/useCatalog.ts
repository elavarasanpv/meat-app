import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Category = { id: string; name: string; sort: number };
export type ProductUnit = "kg" | "piece";
export type Product = {
  id: string;
  category_id: string;
  name: string;
  base_price_per_kg: number; // price per unit (kg or piece)
  unit: ProductUnit;
  image_path: string | null;
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort")
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
        .select("id, category_id, name, base_price_per_kg, unit, image_path")
        .eq("is_active", true)
        .order("name");
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
  });
}
