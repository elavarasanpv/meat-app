import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import {
  RIDER_MAX_ACTIVE_ORDERS,
  RIDER_OFFER_RADIUS_KM,
  haversineKm,
  type RiderCashSubmitInput,
  type RiderDeliverInput,
  type RiderFailInput,
  type RiderPickupInput,
} from "@freshcut/shared";
import { OrdersService } from "../orders/orders.service";
import { SupabaseService } from "../supabase.service";

/** Orders a rider is still responsible for. */
const RIDER_ACTIVE = ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"];

const ORDER_SELECT =
  "id, display_id, status, est_amount, final_amount, payment_mode, rider_fee, created_at, pickup_lat, pickup_lng, arrived_at, " +
  "dealers(shop_name, lat, lng), addresses(label, address_text, landmark, lat, lng), " +
  "delivery_slots(starts_at, ends_at), order_items(id, requested_kg, size, notes, unavailable, products(name, name_ta, unit))";

@Injectable()
export class RiderService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly orders: OrdersService,
  ) {}

  async resolveRider(profileId: string) {
    const db = this.supabase.admin;
    const { data } = await db
      .from("delivery_partners")
      .select("id, profile_id, vehicle, is_online, cash_balance, is_active")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) throw new ForbiddenException("Not a rider");
    return data;
  }

  async me(profileId: string) {
    const rider = await this.resolveRider(profileId);
    return { id: rider.id, vehicle: rider.vehicle, isOnline: rider.is_online, cashBalance: Number(rider.cash_balance) };
  }

  /** Go online (starts a shift) or offline (ends it). */
  async setOnline(profileId: string, online: boolean) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    if (online === rider.is_online) return { isOnline: online };
    await db.from("delivery_partners").update({ is_online: online }).eq("id", rider.id);
    if (online) {
      await db.from("rider_shifts").insert({ rider_id: rider.id });
    } else {
      const { data: shift } = await db
        .from("rider_shifts")
        .select("id")
        .eq("rider_id", rider.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (shift) await db.from("rider_shifts").update({ ended_at: new Date().toISOString() }).eq("id", shift.id);
    }
    return { isOnline: online };
  }

  /**
   * Packed, unclaimed orders near this rider. Broadcast, not reserved:
   * every nearby online rider sees the same list until someone accepts.
   */
  async offers(profileId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    if (!rider.is_online) return [];

    const { count: active } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", rider.id)
      .in("status", RIDER_ACTIVE);
    if ((active ?? 0) >= RIDER_MAX_ACTIVE_ORDERS) return [];

    const { data: loc } = await db.from("rider_locations").select("lat, lng").eq("rider_id", rider.id).maybeSingle();

    const { data } = await db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("status", "PACKED")
      .is("rider_id", null)
      .order("created_at");
    type Row = { id: string; dealers: unknown; addresses: unknown } & Record<string, unknown>;
    const packed = (data ?? []) as unknown as Row[];
    if (!packed.length) return [];

    // Orders this rider already declined stay hidden.
    const { data: declined } = await db.from("rider_offers").select("order_id").eq("rider_id", rider.id).eq("outcome", "rejected");
    const hidden = new Set((declined ?? []).map((d) => d.order_id));

    return packed
      .filter((o) => !hidden.has(o.id))
      .map((o) => {
        const dealer = o.dealers as unknown as { shop_name: string; lat: number | null; lng: number | null };
        const addr = o.addresses as unknown as { lat: number | null; lng: number | null };
        const distanceKm =
          loc && dealer?.lat != null ? Math.round(haversineKm(loc, { lat: dealer.lat, lng: dealer.lng! }) * 10) / 10 : null;
        const dropKm =
          dealer?.lat != null && addr?.lat != null
            ? Math.round(haversineKm({ lat: dealer.lat, lng: dealer.lng! }, { lat: addr.lat, lng: addr.lng! }) * 10) / 10
            : null;
        return { ...o, distance_km: distanceKm, drop_km: dropKm };
      })
      // No location yet → show everything; otherwise only nearby shops.
      .filter((o) => o.distance_km === null || o.distance_km <= RIDER_OFFER_RADIUS_KM);
  }

  /** First tap wins: claim is a single conditional update, so exactly one rider gets it. */
  async accept(profileId: string, orderId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;

    const { count: active } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", rider.id)
      .in("status", RIDER_ACTIVE);
    if ((active ?? 0) >= RIDER_MAX_ACTIVE_ORDERS) throw new BadRequestException("You already have the maximum orders");

    const { data: claimed, error } = await db
      .from("orders")
      .update({ rider_id: rider.id, status: "RIDER_ASSIGNED" })
      .eq("id", orderId)
      .eq("status", "PACKED")
      .is("rider_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);

    const outcome = claimed ? "won" : "lost";
    await db.from("rider_offers").upsert({ order_id: orderId, rider_id: rider.id, outcome }, { onConflict: "order_id,rider_id" });
    if (!claimed) return { accepted: false, reason: "taken" };

    await db.from("order_status_history").insert({
      order_id: orderId,
      from_status: "PACKED",
      to_status: "RIDER_ASSIGNED",
      actor_id: rider.profile_id,
      note: "Rider accepted",
    });
    return { accepted: true };
  }

  /** Hide a broadcast order from this rider's list. */
  async reject(profileId: string, orderId: string) {
    const rider = await this.resolveRider(profileId);
    await this.supabase.admin
      .from("rider_offers")
      .upsert({ order_id: orderId, rider_id: rider.id, outcome: "rejected" }, { onConflict: "order_id,rider_id" });
    return { rejected: true };
  }

  /** The rider's current work: assigned orders plus the open trip's stops. */
  async tasks(profileId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const { data: orders } = await db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("rider_id", rider.id)
      .in("status", RIDER_ACTIVE)
      .order("created_at");

    const { data: trip } = await db
      .from("trips")
      .select("id, dealer_id, started_at, total_km, trip_stops(order_id, seq, actual_seq, arrived_at, delivered_at, failed_at, returned_at, cash_collected)")
      .eq("rider_id", rider.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { orders: orders ?? [], trip: trip ?? null };
  }

  /**
   * Pick up 1–3 assigned orders at the same shop in one go: each moves
   * PICKED_UP → OUT_FOR_DELIVERY and together they form a trip whose stops
   * are sequenced oldest customer first.
   */
  async pickup(profileId: string, input: RiderPickupInput) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;

    const { data: orders } = await db
      .from("orders")
      .select("id, status, rider_id, dealer_id, created_at")
      .in("id", input.orderIds);
    if (!orders || orders.length !== input.orderIds.length) throw new NotFoundException("Order not found");
    for (const o of orders) {
      if (o.rider_id !== rider.id) throw new ForbiddenException("Not your order");
      if (o.status !== "RIDER_ASSIGNED") throw new BadRequestException(`${o.id} is ${o.status}`);
    }
    const dealerIds = new Set(orders.map((o) => o.dealer_id));
    if (dealerIds.size !== 1) throw new BadRequestException("One trip collects from one shop");

    const { data: openTrip } = await db.from("trips").select("id").eq("rider_id", rider.id).is("ended_at", null).maybeSingle();
    if (openTrip) throw new BadRequestException("Finish the current trip first");

    const { data: trip, error } = await db
      .from("trips")
      .insert({ rider_id: rider.id, dealer_id: orders[0].dealer_id })
      .select("id")
      .single();
    if (error) throw new BadRequestException(error.message);

    const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
    await db.from("trip_stops").insert(sorted.map((o, i) => ({ trip_id: trip.id, order_id: o.id, seq: i + 1 })));

    for (const o of sorted) {
      await this.orders.transition({ orderId: o.id, to: "PICKED_UP", actorId: rider.profile_id, note: "Picked up at shop" });
      await this.orders.transition({ orderId: o.id, to: "OUT_FOR_DELIVERY", actorId: rider.profile_id });
    }
    return { tripId: trip.id, stops: sorted.length };
  }

  /** OTP handover: verify, mark delivered, log cash on the stop and the rider. */
  async deliver(profileId: string, input: RiderDeliverInput) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;

    const { data: order } = await db
      .from("orders")
      .select("id, status, rider_id, otp_hash, est_amount, final_amount, payment_mode")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order || order.rider_id !== rider.id) throw new ForbiddenException("Not your order");
    if (order.status !== "OUT_FOR_DELIVERY") throw new BadRequestException(`Order is ${order.status}`);

    const ok = order.otp_hash ? await bcrypt.compare(input.otp, order.otp_hash) : false;
    if (!ok) throw new BadRequestException("Wrong OTP");

    const amount = Number(order.final_amount ?? order.est_amount);
    const cash = input.payment === "cash" ? amount : 0;

    await this.orders.transition({
      orderId: order.id,
      to: "DELIVERED",
      actorId: rider.profile_id,
      note: input.payment === "cash" ? `Cash collected ₹${amount}` : "Paid by UPI",
    });
    await db
      .from("payments")
      .insert({ order_id: order.id, method: input.payment === "cash" ? "cash" : "upi_qr", amount, status: "captured" });

    await this.closeStop(rider.id, order.id, { delivered_at: new Date().toISOString(), cash_collected: cash });
    if (cash > 0) {
      await db.from("delivery_partners").update({ cash_balance: Number(rider.cash_balance) + cash }).eq("id", rider.id);
    }
    return { delivered: true, cashCollected: cash };
  }

  /** Mark a stop failed (app enforces call-and-wait first); the trip continues. */
  async fail(profileId: string, input: RiderFailInput) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, status, rider_id").eq("id", input.orderId).maybeSingle();
    if (!order || order.rider_id !== rider.id) throw new ForbiddenException("Not your order");
    if (order.status !== "OUT_FOR_DELIVERY") throw new BadRequestException(`Order is ${order.status}`);

    await db.from("delivery_attempts").insert({
      order_id: order.id,
      rider_id: rider.id,
      reason: input.reason,
      photo_path: input.photoPath ?? null,
    });
    await this.orders.transition({ orderId: order.id, to: "DELIVERY_FAILED", actorId: rider.profile_id, note: input.reason });
    await this.closeStop(rider.id, order.id, { failed_at: new Date().toISOString() });
    return { failed: true };
  }

  /** Failed packet handed back at the shop after the last stop. */
  async returnToShop(profileId: string, orderId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, status, rider_id").eq("id", orderId).maybeSingle();
    if (!order || order.rider_id !== rider.id) throw new ForbiddenException("Not your order");
    if (order.status !== "DELIVERY_FAILED") throw new BadRequestException(`Order is ${order.status}`);
    await this.orders.transition({ orderId, to: "RETURNED", actorId: rider.profile_id, note: "Returned to shop" });
    await db.from("trip_stops").update({ returned_at: new Date().toISOString() }).eq("order_id", orderId);
    return { returned: true };
  }

  /** Who to call for this order. Today the real number; later a masked one — same endpoint. */
  async contact(profileId: string, orderId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, rider_id, customer_id").eq("id", orderId).maybeSingle();
    if (!order || order.rider_id !== rider.id) throw new ForbiddenException("Not your order");
    const { data: profile } = await db.from("profiles").select("phone, full_name").eq("id", order.customer_id).single();
    return { name: profile?.full_name ?? null, phone: profile?.phone ? `+${profile.phone}` : null };
  }

  /** Today's numbers for the rider's Home. */
  async summary(profileId: string) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { data: trips } = await db
      .from("trips")
      .select("id, total_km, trip_stops(delivered_at, failed_at, cash_collected)")
      .eq("rider_id", rider.id)
      .gte("started_at", dayStart.toISOString());

    let deliveries = 0;
    let failed = 0;
    let cash = 0;
    let km = 0;
    for (const t of trips ?? []) {
      km += Number(t.total_km ?? 0);
      for (const s of (t.trip_stops as { delivered_at: string | null; failed_at: string | null; cash_collected: number }[]) ?? []) {
        if (s.delivered_at) deliveries += 1;
        if (s.failed_at) failed += 1;
        cash += Number(s.cash_collected);
      }
    }
    return { deliveries, failed, km: Math.round(km * 10) / 10, cashToday: cash, cashInHand: Number(rider.cash_balance) };
  }

  /** Finished trips, newest first, with their stops. */
  async history(profileId: string) {
    const rider = await this.resolveRider(profileId);
    const { data } = await this.supabase.admin
      .from("trips")
      .select(
        "id, started_at, ended_at, total_km, trip_stops(order_id, seq, actual_seq, delivered_at, failed_at, cash_collected, orders(display_id, est_amount, final_amount))",
      )
      .eq("rider_id", rider.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(50);
    return data ?? [];
  }

  /** Day-end cash hand-over: records it for the admin and clears the balance. */
  async cashSubmit(profileId: string, input: RiderCashSubmitInput) {
    const rider = await this.resolveRider(profileId);
    const db = this.supabase.admin;
    const expected = Number(rider.cash_balance);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await db.from("cash_submissions").upsert(
      {
        rider_id: rider.id,
        business_date: today,
        expected,
        submitted: input.amount,
        mismatch_note: input.amount === expected ? null : `expected ₹${expected}, handed ₹${input.amount}`,
      },
      { onConflict: "rider_id,business_date" },
    );
    if (error) throw new BadRequestException(error.message);
    await db.from("delivery_partners").update({ cash_balance: Math.max(0, expected - input.amount) }).eq("id", rider.id);
    return { expected, submitted: input.amount };
  }

  /**
   * Fill the stop row and, when it was the trip's last open stop, close the
   * trip with a straight-line km total (shop → stops in delivered order).
   */
  private async closeStop(riderId: string, orderId: string, patch: Record<string, unknown>) {
    const db = this.supabase.admin;
    const { data: stop } = await db.from("trip_stops").select("id, trip_id").eq("order_id", orderId).maybeSingle();
    if (!stop) return; // order delivered without a trip (shouldn't happen, but never block a handover)

    const { data: all } = await db
      .from("trip_stops")
      .select("id, order_id, delivered_at, failed_at, actual_seq")
      .eq("trip_id", stop.trip_id);
    const done = (all ?? []).filter((s) => s.id !== stop.id && (s.delivered_at || s.failed_at)).length;
    await db.from("trip_stops").update({ ...patch, actual_seq: done + 1 }).eq("id", stop.id);

    if (done + 1 === (all ?? []).length) {
      const km = await this.tripKm(stop.trip_id);
      await db.from("trips").update({ ended_at: new Date().toISOString(), total_km: km }).eq("id", stop.trip_id);
    }
  }

  private async tripKm(tripId: string): Promise<number> {
    const db = this.supabase.admin;
    const { data: trip } = await db
      .from("trips")
      .select("dealer_id, dealers(lat, lng), trip_stops(actual_seq, orders(addresses(lat, lng)))")
      .eq("id", tripId)
      .single();
    if (!trip) return 0;
    const dealer = trip.dealers as unknown as { lat: number | null; lng: number | null };
    if (dealer?.lat == null) return 0;
    const stops = ((trip.trip_stops as unknown as { actual_seq: number | null; orders: { addresses: { lat: number | null; lng: number | null } } }[]) ?? [])
      .filter((s) => s.actual_seq != null && s.orders?.addresses?.lat != null)
      .sort((a, b) => (a.actual_seq ?? 0) - (b.actual_seq ?? 0));
    let prev = { lat: dealer.lat, lng: dealer.lng! };
    let km = 0;
    for (const s of stops) {
      const point = { lat: s.orders.addresses.lat!, lng: s.orders.addresses.lng! };
      km += haversineKm(prev, point);
      prev = point;
    }
    return Math.round(km * 10) / 10;
  }
}
