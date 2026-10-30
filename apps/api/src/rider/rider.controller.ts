import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { riderCashSubmitSchema, riderDeliverSchema, riderFailSchema, riderLocationSchema, riderPickupSchema } from "@freshcut/shared";
import { RiderService } from "./rider.service";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";

/** Statuses during which a rider's position is useful (and shared with the customer). */
const ACTIVE = ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

@Controller("rider")
export class RiderController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly rider: RiderService,
  ) {}

  private parse<T>(schema: { safeParse: (b: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error?.issues.map((i) => i.message).join("; "));
    return parsed.data as T;
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
    return { stored: true };
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
    return { arrivedAt };
  }
}
