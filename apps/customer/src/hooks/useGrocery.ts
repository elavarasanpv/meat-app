import { useEffect } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import type { FeeRule } from "@/store/cart";

/**
 * Grocery vertical (G2). Everything here is empty/false until the admin
 * switches `verticals.grocery` on — RLS and the definer-rights lookups
 * (grocery_catalog, grocery_fee) both key on that flag, so the app needs no
 * build to go live. The customer never sees a shop: the catalog is whatever
 * the shops serving their pincode list, and checkout picks the shop(s).
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
  return useQuery({
    queryKey: ["grocery", "fee", pincode ?? "none"],
    enabled: !!pincode,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FeeRule | null> => {
      const { data, error } = await supabase.rpc("grocery_fee", { p_pincode: pincode });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { min_order: number; fee: number; free_above: number | null } | undefined;
      return row ? { minOrder: Number(row.min_order), fee: Number(row.fee), freeAbove: row.free_above == null ? null : Number(row.free_above) } : null;
    },
  });
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
};

/** Everything a customer at this pincode can buy (empty while the vertical is off). */
export function useGroceryCatalog(pincode?: string) {
  return useQuery({
    queryKey: ["grocery", "catalog", pincode ?? "none"],
    enabled: !!pincode,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("grocery_catalog", { p_pincode: pincode });
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
