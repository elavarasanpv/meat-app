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
