import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus } from "@freshcut/shared";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";

export type Address = {
  id: string;
  label: string;
  address_text: string;
  landmark: string | null;
  pincode: string;
  lat: number | null;
  lng: number | null;
};

export type Slot = { startsAt: string; endsAt: string; day: "today" | "tomorrow"; label: string };

export type OrderSummary = {
  id: string;
  display_id: string;
  status: OrderStatus;
  est_amount: number;
  final_amount: number | null;
  payment_mode: "cod" | "upi_on_delivery" | "prepaid_upi";
  created_at: string;
  delivery_slots: { starts_at: string; ends_at: string } | null;
  order_items: { id: string }[];
};

export type OrderDetail = Omit<OrderSummary, "order_items"> & {
  rider_id: string | null;
  arrived_at: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  addresses: { label: string; address_text: string; landmark: string | null; lat: number | null; lng: number | null } | null;
  order_items: {
    id: string;
    requested_kg: number;
    actual_kg: number | null;
    unit_price_per_kg: number;
    size: string | null;
    notes: string | null;
    products: { name: string; name_ta: string | null; unit: "kg" | "piece" } | null;
  }[];
  order_status_history: { to_status: OrderStatus; created_at: string }[];
};

export function useAddresses() {
  const userId = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ["addresses", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("id, label, address_text, landmark, pincode, lat, lng")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Address[];
    },
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async (input: { label: string; address_text: string; landmark?: string; pincode: string; lat?: number; lng?: number }) => {
      const { data, error } = await supabase
        .from("addresses")
        .insert({ ...input, user_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useUpdateAddressLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lat, lng }: { id: string; lat: number; lng: number }) => {
      const { error } = await supabase.from("addresses").update({ lat, lng }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useSlots() {
  return useQuery({
    queryKey: ["slots"],
    queryFn: () => api<Slot[]>("/orders/slots"),
    staleTime: 60_000,
  });
}

export type PlaceOrderResult = { orderId: string; displayId: string; estAmount: number; otp: string };

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api<PlaceOrderResult>("/orders", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

const SUMMARY = "id,display_id,status,est_amount,final_amount,payment_mode,created_at,delivery_slots(starts_at,ends_at),order_items(id)";

export function useOrders() {
  const userId = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ["orders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(SUMMARY).order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrderSummary[];
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      // PostgREST rejects whitespace in select and duplicate embeds, so build it compact.
      const select = [
        "id,display_id,status,est_amount,final_amount,payment_mode,created_at,rider_id,arrived_at,pickup_lat,pickup_lng",
        "delivery_slots(starts_at,ends_at)",
        "addresses(label,address_text,landmark,lat,lng)",
        "order_items(id,requested_kg,actual_kg,unit_price_per_kg,size,notes,products(name,name_ta,unit))",
        "order_status_history(to_status,created_at)",
      ].join(",");
      const { data, error } = await supabase.from("orders").select(select).eq("id", id!).single();
      if (error) throw error;
      return data as unknown as OrderDetail;
    },
  });
}

export function useOrderOtp(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", "otp", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_otps").select("otp").eq("order_id", id!).maybeSingle();
      if (error) throw error;
      return (data?.otp as string | undefined) ?? null;
    },
  });
}
