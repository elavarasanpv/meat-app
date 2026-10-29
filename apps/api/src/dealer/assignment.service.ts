import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { haversineKm } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { OrdersService } from "../orders/orders.service";

/** How long a shop has to answer before the order moves to the next one. */
export const ACCEPT_WINDOW_MIN = 5;
const SWEEP_MS = 30_000;

/**
 * Offers each new order to one shop at a time:
 * serves the pincode → open right now → has every item in stock → nearest.
 * A shop that rejects or lets the 5-minute window lapse is skipped and the
 * next one is offered. The sweeper enforces the window even if the app died.
 */
@Injectable()
export class AssignmentService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep().catch((e) => console.error("[assign] sweep", e)), SWEEP_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Offer the order to the best shop that has not been tried yet. */
  async offer(orderId: string): Promise<{ assigned: boolean; dealerId?: string }> {
    const db = this.supabase.admin;
    const { data: order } = await db
      .from("orders")
      .select("id, status, dealer_id, addresses(pincode, lat, lng), order_items(product_id, unavailable)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || !["PLACED", "DEALER_ASSIGNED"].includes(order.status)) return { assigned: false };
    const addr = order.addresses as unknown as { pincode: string; lat: number | null; lng: number | null } | null;
    if (!addr) return { assigned: false };

    const needed = (order.order_items as { product_id: string; unavailable: boolean }[])
      .filter((i) => !i.unavailable)
      .map((i) => i.product_id);

    // Shops serving this pincode and open right now
    const now = new Date().toISOString();
    const { data: rows } = await db
      .from("dealer_pincodes")
      .select("dealer_id, dealers!inner(id, profile_id, lat, lng, is_active, is_open, closed_until)")
      .eq("pincode", addr.pincode);
    const open = (rows ?? [])
      .map((r) => r.dealers as unknown as { id: string; profile_id: string; lat: number | null; lng: number | null; is_active: boolean; is_open: boolean; closed_until: string | null })
      .filter((d) => d.is_active && d.is_open && (!d.closed_until || d.closed_until <= now));

    // Already-tried shops are out
    const { data: tried } = await db.from("order_assignments").select("dealer_id").eq("order_id", orderId);
    const triedIds = new Set((tried ?? []).map((t) => t.dealer_id));
    let candidates = open.filter((d) => !triedIds.has(d.id));

    // Every needed item must be stocked (a dealer_products row, not out of stock)
    if (candidates.length && needed.length) {
      const { data: stock } = await db
        .from("dealer_products")
        .select("dealer_id, product_id, out_of_stock_until")
        .in("dealer_id", candidates.map((d) => d.id))
        .in("product_id", needed);
      const inStock = new Map<string, Set<string>>();
      for (const s of stock ?? []) {
        if (s.out_of_stock_until && s.out_of_stock_until > now) continue;
        if (!inStock.has(s.dealer_id)) inStock.set(s.dealer_id, new Set());
        inStock.get(s.dealer_id)!.add(s.product_id);
      }
      candidates = candidates.filter((d) => needed.every((p) => inStock.get(d.id)?.has(p)));
    }

    if (!candidates.length) {
      // Nobody left to try: flag for admin, leave the order where it is.
      if (order.dealer_id) await db.from("orders").update({ dealer_id: null }).eq("id", orderId);
      console.warn(`[assign] no shop available for order ${orderId} (pincode ${addr.pincode})`);
      return { assigned: false };
    }

    // Nearest first (haversine; shops without a pin go last)
    candidates.sort((a, b) => this.distance(a, addr) - this.distance(b, addr));
    const dealer = candidates[0];

    const deadline = new Date(Date.now() + ACCEPT_WINDOW_MIN * 60_000).toISOString();
    const { error } = await db.from("order_assignments").insert({ order_id: orderId, dealer_id: dealer.id, deadline_at: deadline });
    if (error) throw new Error(error.message);
    await db.from("orders").update({ dealer_id: dealer.id }).eq("id", orderId);
    if (order.status === "PLACED") {
      await this.orders.transition({ orderId, to: "DEALER_ASSIGNED", actorId: dealer.profile_id, note: "offered to shop" });
    }
    return { assigned: true, dealerId: dealer.id };
  }

  /** Time out lapsed offers and pass each order to the next shop. */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const db = this.supabase.admin;
      const now = new Date().toISOString();
      const { data: lapsed } = await db
        .from("order_assignments")
        .select("id, order_id, orders!inner(status)")
        .eq("outcome", "pending")
        .lt("deadline_at", now)
        .limit(20);
      for (const a of lapsed ?? []) {
        const status = (a.orders as unknown as { status: string }).status;
        // Order moved on (accepted elsewhere/cancelled): close the offer quietly.
        const outcome = status === "DEALER_ASSIGNED" ? "timeout" : "cancelled";
        await db.from("order_assignments").update({ outcome, responded_at: now }).eq("id", a.id).eq("outcome", "pending");
        if (outcome === "timeout") await this.offer(a.order_id);
      }
    } finally {
      this.sweeping = false;
    }
  }

  private distance(d: { lat: number | null; lng: number | null }, addr: { lat: number | null; lng: number | null }) {
    if (d.lat == null || d.lng == null || addr.lat == null || addr.lng == null) return Number.MAX_SAFE_INTEGER;
    return haversineKm({ lat: d.lat, lng: d.lng }, { lat: addr.lat, lng: addr.lng });
  }
}
