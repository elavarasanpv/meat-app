import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type DealerMe = { id: string; shop_name: string; is_open: boolean; closed_until: string | null };

export type DealerOrderItem = {
  id: string;
  product_id: string;
  requested_kg: number;
  actual_kg: number | null;
  size: string | null;
  notes: string | null;
  unavailable: boolean;
  shop_price_per_kg: number;
  products: { name: string; name_ta: string | null; unit: "kg" | "piece" };
};

export type DealerOrder = {
  id: string;
  display_id: string;
  status: "DEALER_ASSIGNED" | "ACCEPTED" | "PACKING" | "PACKED";
  ready_by: string | null;
  accept_deadline: string | null;
  created_at: string;
  delivery_slots: { starts_at: string; ends_at: string } | null;
  order_items: DealerOrderItem[];
};

export function useDealerMe() {
  return useQuery<DealerMe>({ queryKey: ["dealer", "me"], queryFn: () => api("/dealer/me"), retry: false });
}

/** The shop's open orders; realtime on `orders` plus a 15 s poll for safety. */
export function useDealerOrders(dealerId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery<DealerOrder[]>({
    queryKey: ["dealer", "orders"],
    enabled: !!dealerId,
    refetchInterval: 15_000,
    queryFn: () => api("/dealer/orders"),
  });

  useEffect(() => {
    if (!dealerId) return;
    const channel = supabase
      .channel(`dealer-${dealerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `dealer_id=eq.${dealerId}` }, () =>
        qc.invalidateQueries({ queryKey: ["dealer", "orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealerId]);

  return query;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["dealer", "orders"] });
}

export function useAccept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; readyMinutes: number }) => api("/dealer/orders/accept", { method: "POST", body: p }),
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

export type StockRow = { product_id: string; name: string; name_ta: string | null; unit: string; out_of_stock_until: string | null };

/** The shop's product list with stock state (read straight from Supabase). */
export function useStock(dealerId: string | undefined) {
  return useQuery<StockRow[]>({
    queryKey: ["dealer", "stock"],
    enabled: !!dealerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_products")
        .select("product_id, out_of_stock_until, products(name, name_ta, unit)")
        .eq("dealer_id", dealerId!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const p = r.products as unknown as { name: string; name_ta: string | null; unit: string };
          return { product_id: r.product_id, out_of_stock_until: r.out_of_stock_until, name: p.name, name_ta: p.name_ta, unit: p.unit };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
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
