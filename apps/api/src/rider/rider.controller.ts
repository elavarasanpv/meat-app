import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { NEARING_KM, haversineKm, riderCashSubmitSchema, riderDeliverSchema, riderFailSchema, riderLocationBatchSchema, riderLocationSchema, riderPickupSchema } from "@thanjozmart/shared";
import { RiderService } from "./rider.service";
import { cashLine, riderFirstName } from "../orders/orders.service";
import { PushService } from "../push/push.service";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";

/** Statuses during which a rider's position is useful (and shared with the customer). */
const ACTIVE = ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

@Controller("rider")
export class RiderController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly rider: RiderService,
    private readonly push: PushService,
  ) {}

  private parse<T>(schema: { safeParse: (b: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error?.issues.map((i) => i.message).join("; "));
    return parsed.data as T;
  }

  /** POST /rider/locations { points: [{ lat, lng, heading?, speedKmh?, at }] } — batched GPS. */
  @Post("locations")
  async locations(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = this.parse(riderLocationBatchSchema, body);
    const result = await this.rider.locations(user.id, input);
    const last = [...input.points].sort((a, b) => a.at.localeCompare(b.at)).pop();
    if (last && result.stored) void this.nearing(user.id, last.lat, last.lng);
    return result;
  }

  /** GET /rider/me */
  @Get("me")
  async me(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.me(user.id);
  }

  /** POST /rider/online { online } — also starts/ends the shift log. */
  @Post("online")
  async online(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const { online } = this.parse(z.object({ online: z.boolean() }), body);
    return this.rider.setOnline(user.id, online);
  }

  /** GET /rider/offers — packed orders near me (broadcast; first accept wins). */
  @Get("offers")
  async offers(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.offers(user.id);
  }

  /** POST /rider/offers/accept { orderId } */
  @Post("offers/accept")
  async accept(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const { orderId } = this.parse(z.object({ orderId: z.string().uuid() }), body);
    return this.rider.accept(user.id, orderId);
  }

  /** POST /rider/offers/reject { orderId } — hides it from this rider only. */
  @Post("offers/reject")
  async reject(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const { orderId } = this.parse(z.object({ orderId: z.string().uuid() }), body);
    return this.rider.reject(user.id, orderId);
  }

  /** GET /rider/tasks — my active orders and the open trip. */
  @Get("tasks")
  async tasks(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.tasks(user.id);
  }

  /** POST /rider/pickup { orderIds } — collect at the shop; starts the trip. */
  @Post("pickup")
  async pickup(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.pickup(user.id, this.parse(riderPickupSchema, body));
  }

  /** POST /rider/reorder { orderId, reason } — deliver this stop next (logged). */
  @Post("reorder")
  async reorder(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const { orderId, reason } = this.parse(z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(2).max(200) }), body);
    return this.rider.reorder(user.id, orderId, reason);
  }

  /** POST /rider/deliver { orderId, otp, payment } */
  @Post("deliver")
  async deliver(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.deliver(user.id, this.parse(riderDeliverSchema, body));
  }

  /** POST /rider/fail { orderId, reason, photoPath? } */
  @Post("fail")
  async fail(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.fail(user.id, this.parse(riderFailSchema, body));
  }

  /** POST /rider/return { orderId } — failed packet handed back at the shop. */
  @Post("return")
  async returnToShop(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const { orderId } = this.parse(z.object({ orderId: z.string().uuid() }), body);
    return this.rider.returnToShop(user.id, orderId);
  }

  /** GET /rider/contact/:orderId — who to call (maskable later, same endpoint). */
  @Get("contact/:orderId")
  async contact(@Headers("authorization") auth: string | undefined, @Param("orderId") orderId: string) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.contact(user.id, orderId);
  }

  /** GET /rider/summary — today's deliveries, km and cash. */
  @Get("summary")
  async summary(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.summary(user.id);
  }

  /** GET /rider/history — finished trips with stops. */
  @Get("history")
  async history(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.history(user.id);
  }

  /** GET /rider/cash — today's cash per order and past hand-overs. */
  @Get("cash")
  async cash(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.cash(user.id);
  }

  /** POST /rider/cash-submit { amount } — day-end hand-over. */
  @Post("cash-submit")
  async cashSubmit(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.rider.cashSubmit(user.id, this.parse(riderCashSubmitSchema, body));
  }

  /**
   * POST /rider/location — the partner app sends this every ~45 s (or ~100 m)
   * while the rider has an active order. Stores only the latest position.
   */
  @Post("location")
  async location(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const parsed = riderLocationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join("; "));
    const { lat, lng, heading, speedKmh } = parsed.data;
    const db = this.supabase.admin;

    const { data: rider } = await db.from("delivery_partners").select("id, is_online").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (!rider) throw new ForbiddenException("Not a rider");

    if (!rider.is_online) {
      const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("rider_id", rider.id).in("status", ACTIVE);
      if (!count) return { stored: false, reason: "offline, no active order" };
    }

    const { error } = await db.from("rider_locations").upsert({
      rider_id: rider.id,
      lat,
      lng,
      heading: heading ?? null,
      speed_kmh: speedKmh ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    void this.nearing(user.id, lat, lng);
    return { stored: true };
  }

  /** Orders already told "arriving soon". In memory: a restart can at worst repeat one push. */
  private readonly nearingSent = new Set<string>();

  /**
   * The rider's new position is within NEARING_KM of a customer's house:
   * tell that customer once, with the rider's name and what to keep ready.
   * The push at the door itself is separate (POST /rider/arrived). Fire-and-forget.
   */
  private async nearing(profileId: string, lat: number, lng: number) {
    try {
      const db = this.supabase.admin;
      const { data: rider } = await db.from("delivery_partners").select("id, profiles(full_name)").eq("profile_id", profileId).maybeSingle();
      if (!rider) return;
      const { data: orders } = await db
        .from("orders")
        .select("id, customer_id, display_id, payment_mode, est_amount, final_amount, addresses(lat, lng)")
        .eq("rider_id", rider.id)
        .eq("status", "OUT_FOR_DELIVERY")
        .is("arrived_at", null);
      const name = riderFirstName((rider.profiles as unknown as { full_name: string | null } | null)?.full_name);
      for (const o of orders ?? []) {
        const home = o.addresses as unknown as { lat: number | null; lng: number | null } | null;
        if (this.nearingSent.has(o.id) || home?.lat == null || home?.lng == null) continue;
        if (haversineKm({ lat, lng }, { lat: home.lat, lng: home.lng }) > NEARING_KM) continue;
        this.nearingSent.add(o.id);
        const cash = cashLine(o.payment_mode, Number(o.final_amount ?? o.est_amount));
        void this.push.toProfiles([o.customer_id], {
          title: "Order arriving soon",
          body: `${o.display_id} · ${name.en} is about to reach your location.${cash.en}`,
          ta: { title: "ஆர்டர் விரைவில் வந்துவிடும்", body: `${o.display_id} · ${name.ta} உங்கள் இடத்தை நெருங்கிவிட்டார்.${cash.ta}` },
          data: { kind: "status", status: "OUT_FOR_DELIVERY", orderId: o.id },
          channelId: "delivery",
        });
      }
    } catch (e) {
      console.warn("[push] nearing", (e as Error).message);
    }
  }

  /**
   * POST /rider/arrived { orderId } — rider is at the customer's door.
   * Marks arrived_at; the order stays OUT_FOR_DELIVERY until the OTP handover.
   */
  @Post("arrived")
  async arrived(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const parsed = z.object({ orderId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("orderId required");
    const db = this.supabase.admin;

    const { data: rider } = await db.from("delivery_partners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (!rider) throw new ForbiddenException("Not a rider");

    const { data: order } = await db.from("orders").select("id, status, rider_id, arrived_at").eq("id", parsed.data.orderId).maybeSingle();
    if (!order || order.rider_id !== rider.id) throw new ForbiddenException("Not your order");
    if (order.status !== "OUT_FOR_DELIVERY") throw new BadRequestException(`Order is ${order.status}`);
    if (order.arrived_at) return { arrivedAt: order.arrived_at };

    const arrivedAt = new Date().toISOString();
    const { error } = await db.from("orders").update({ arrived_at: arrivedAt }).eq("id", order.id);
    if (error) throw new BadRequestException(error.message);
    await db.from("order_status_history").insert({ order_id: order.id, from_status: "OUT_FOR_DELIVERY", to_status: "OUT_FOR_DELIVERY", actor_id: user.id, note: "Rider arrived at the door" });
    // Tell the customer (with the happy parcel jingle) even if their app is closed.
    void db
      .from("orders")
      .select("customer_id, display_id, payment_mode, est_amount, final_amount, delivery_partners:rider_id(profiles(full_name))")
      .eq("id", order.id)
      .single()
      .then(({ data }) => {
        if (!data) return null;
        const name = riderFirstName((data.delivery_partners as unknown as { profiles: { full_name: string | null } | null } | null)?.profiles?.full_name);
        const cash = cashLine(data.payment_mode, Number(data.final_amount ?? data.est_amount));
        return this.push.toProfiles([data.customer_id], {
          title: "Your Thanjoz Mart order is here!",
          body: `${name.en} is at your door. Keep your delivery code ready.${cash.en}`,
          ta: { title: "உங்கள் Thanjoz Mart ஆர்டர் வந்துவிட்டது!", body: `${name.ta} உங்கள் வாசலில் இருக்கிறார். டெலிவரி குறியீட்டைத் தயாராக வைத்திருங்கள்.${cash.ta}` },
          data: { kind: "arrived", orderId: order.id },
          channelId: "delivery",
        });
      });
    return { arrivedAt };
  }
}
