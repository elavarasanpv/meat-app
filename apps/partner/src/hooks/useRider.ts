import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type RiderMe = { id: string; name: string | null; phone: string | null; vehicle: string | null; isOnline: boolean; cashBalance: number };

export type RiderOrderItem = {
  id: string;
  requested_kg: number;
  size: string | null;
  notes: string | null;
  unavailable: boolean;
  products: { name: string; name_ta: string | null; unit: "kg" | "piece" };
};

export type RiderOrderStatus = "RIDER_ASSIGNED" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERY_FAILED";

export type RiderOrder = {
  id: string;
  display_id: string;
  status: RiderOrderStatus | "PACKED";
  est_amount: number;
  final_amount: number | null;
  payment_mode: "cod" | "upi_on_delivery" | "prepaid_upi";
  created_at: string;
  arrived_at: string | null;
  dealers: { shop_name: string; lat: number | null; lng: number | null } | null;
  addresses: { label: string | null; address_text: string; landmark: string | null; lat: number | null; lng: number | null } | null;
  delivery_slots: { starts_at: string; ends_at: string } | null;
  order_items: RiderOrderItem[];
  /** Offers only: straight-line km from the rider to the shop and shop to the customer. */
  distance_km?: number | null;
  drop_km?: number | null;
};

export type TripStop = {
  order_id: string;
  seq: number;
  actual_seq: number | null;
  arrived_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  returned_at: string | null;
  cash_collected: number;
};
export type Trip = { id: string; dealer_id: string; started_at: string; total_km: number | null; trip_stops: TripStop[] };
export type Tasks = { orders: RiderOrder[]; trip: Trip | null };

export type RiderSummary = { deliveries: number; failed: number; km: number; cashToday: number; cashInHand: number };

export type HistoryTrip = {
  id: string;
  started_at: string;
  ended_at: string | null;
  total_km: number | null;
  trip_stops: (TripStop & { orders: { display_id: string; est_amount: number; final_amount: number | null } })[];
};

/** What the customer pays at the door (exactly the checkout price). */
export const amountDue = (o: Pick<RiderOrder, "est_amount" | "final_amount">) => Number(o.final_amount ?? o.est_amount);

export function useRiderMe() {
  return useQuery<RiderMe>({ queryKey: ["rider", "me"], queryFn: () => api("/rider/me"), retry: false });
}

export function useSetOnline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (online: boolean) => api<{ isOnline: boolean }>("/rider/online", { method: "POST", body: { online } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rider"] }),
  });
}

/** Broadcast offers: every nearby online rider polls the same list; first accept wins. */
export function useOffers(online: boolean | undefined) {
  return useQuery<RiderOrder[]>({
    queryKey: ["rider", "offers"],
    enabled: !!online,
    refetchInterval: 8_000,
    queryFn: () => api("/rider/offers"),
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api<{ accepted: boolean; reason?: string }>("/rider/offers/accept", { method: "POST", body: { orderId } }),
    onSettled: () => invalidate(qc),
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api("/rider/offers/reject", { method: "POST", body: { orderId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rider", "offers"] }),
  });
}

/** Active orders + open trip (15 s poll; realtime refreshes instantly). */
export function useTasks(riderId: string | undefined) {
  return useQuery<Tasks>({
    queryKey: ["rider", "tasks"],
    enabled: !!riderId,
    refetchInterval: 15_000,
    queryFn: () => api("/rider/tasks"),
  });
}

/** One realtime subscription for the whole rider app (mount once in the rider layout). */
export function useRiderRealtime(riderId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`rider-${riderId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `rider_id=eq.${riderId}` }, () => invalidate(qc))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [riderId]);
}

export function usePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderIds: string[]) => api<{ tripId: string; stops: number }>("/rider/pickup", { method: "POST", body: { orderIds } }),
    onSettled: () => invalidate(qc),
  });
}

export function useArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api("/rider/arrived", { method: "POST", body: { orderId } }),
    onSettled: () => invalidate(qc),
  });
}

export function useDeliver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; otp: string; payment: "cash" | "upi" }) =>
      api<{ delivered: boolean; cashCollected: number }>("/rider/deliver", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useFail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; reason: string }) => api("/rider/fail", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api("/rider/return", { method: "POST", body: { orderId } }),
    onSettled: () => invalidate(qc),
  });
}

/** Phone to call for an order — via the server so it can be masked later. */
export function useContact(orderId: string | undefined) {
  return useQuery<{ name: string | null; phone: string | null }>({
    queryKey: ["rider", "contact", orderId],
    enabled: !!orderId,
    staleTime: 10 * 60_000,
    queryFn: () => api(`/rider/contact/${orderId}`),
  });
}

export function useRiderSummary(riderId: string | undefined) {
  return useQuery<RiderSummary>({ queryKey: ["rider", "summary"], enabled: !!riderId, refetchInterval: 30_000, queryFn: () => api("/rider/summary") });
}

export function useRiderHistory(riderId: string | undefined) {
  return useQuery<HistoryTrip[]>({ queryKey: ["rider", "history"], enabled: !!riderId, queryFn: () => api("/rider/history") });
}

export type CashView = {
  inHand: number;
  today: { orderId: string; displayId: string; deliveredAt: string; cash: number }[];
  handovers: { date: string; expected: number; submitted: number | null; note: string | null; verified: boolean }[];
};

export function useRiderCash(riderId: string | undefined) {
  return useQuery<CashView>({ queryKey: ["rider", "cash"], enabled: !!riderId, queryFn: () => api("/rider/cash") });
}

/** Deliver this stop next (reason is logged for the admin). */
export function useReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { orderId: string; reason: string }) => api("/rider/reorder", { method: "POST", body: p }),
    onSettled: () => invalidate(qc),
  });
}

export function useCashSubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api<{ expected: number; submitted: number }>("/rider/cash-submit", { method: "POST", body: { amount } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rider"] }),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["rider", "tasks"] });
  qc.invalidateQueries({ queryKey: ["rider", "offers"] });
  qc.invalidateQueries({ queryKey: ["rider", "summary"] });
  qc.invalidateQueries({ queryKey: ["rider", "history"] });
  qc.invalidateQueries({ queryKey: ["rider", "me"] });
}
