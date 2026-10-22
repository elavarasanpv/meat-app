import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type RiderLocation = { lat: number; lng: number; heading: number | null; updated_at: string };

/** Fallback polling interval when the realtime socket is down (rural networks). */
const POLL_MS = 30_000;

/**
 * Latest rider position for an order, kept live two ways:
 *  - Supabase Realtime pushes each update instantly;
 *  - a 30 s poll covers dropped sockets.
 * Also refreshes the order itself when its status changes.
 */
export function useRiderLocation(orderId: string | undefined, riderId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["rider-location", riderId];

  const query = useQuery({
    queryKey: key,
    enabled: !!riderId,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_locations")
        .select("lat,lng,heading,updated_at")
        .eq("rider_id", riderId!)
        .maybeSingle();
      if (error) throw error;
      return (data as RiderLocation | null) ?? null;
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase.channel(`track-${orderId}`);
    if (riderId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rider_locations", filter: `rider_id=eq.${riderId}` },
        (payload) => {
          const row = payload.new as RiderLocation | undefined;
          if (row && "lat" in row) qc.setQueryData(key, row);
        },
      );
    }
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
      () => qc.invalidateQueries({ queryKey: ["orders"] }),
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, riderId]);

  return query;
}
