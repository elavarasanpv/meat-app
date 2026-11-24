import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCart, type FeeRule, type Vertical } from "@/store/cart";

const num = (v: unknown) => Number(v ?? 0);

/**
 * Delivery terms for this customer at this pincode: minimum order, fee,
 * free-above and whether their first order rides free. Set by the admin;
 * the server charges from the same rules when the order is placed.
 */
export function useDeliveryTerms(vertical: Vertical, pincode?: string) {
  return useQuery({
    queryKey: ["delivery", vertical, pincode ?? "any"],
    staleTime: 60_000,
    refetchOnMount: "always",
    queryFn: async (): Promise<FeeRule | null> => {
      const { data, error } = await supabase.rpc("delivery_quote", { p_vertical: vertical, p_pincode: pincode ?? null });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { min_order: number; fee: number; free_above: number | null; first_order_free: boolean } | undefined;
      if (!row) return null;
      return { minOrder: num(row.min_order), fee: num(row.fee), freeAbove: row.free_above == null ? null : num(row.free_above), firstOrderFree: !!row.first_order_free };
    },
  });
}

const same = (a: FeeRule | null, b: FeeRule | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The terms to price a basket with: the live answer for the pincode, else the
 * copy kept from last time (so the cart still adds up offline).
 */
export function useBasketTerms(vertical: Vertical, pincode?: string): FeeRule | null {
  const live = useDeliveryTerms(vertical, pincode);
  const kept = useCart((s) => (vertical === "grocery" ? s.feeRule : s.meatRule));
  useEffect(() => {
    if (live.data === undefined || same(live.data, kept)) return;
    const s = useCart.getState();
    if (vertical === "grocery") s.setFeeRule(live.data);
    else s.setMeatRule(live.data);
  }, [live.data, vertical]);
  return live.data !== undefined ? live.data : kept;
}
