import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { addOrderItemsSchema, cancelOrderSchema, orderStatusSchema, placeGroceryOrderSchema, placeOrderSchema, upcomingSlots, rateOrderSchema } from "@thanjozmart/shared";
import { OrdersService } from "./orders.service";
import { SuggestionsService } from "./suggestions.service";
import { OffersService } from "../offers/offers.service";
import { AssignmentService } from "../dealer/assignment.service";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";

const transitionBody = z.object({
  orderId: z.string().uuid(),
  to: orderStatusSchema,
  note: z.string().max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** Google's encoded polyline format → points. */
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly supabase: SupabaseService,
    private readonly assignment: AssignmentService,
    private readonly suggest: SuggestionsService,
    private readonly offers: OffersService,
  ) {}

  /** GET /orders/slots — delivery windows the customer can pick right now. */
  @Get("slots")
  slots() {
    return upcomingSlots();
  }

  /** GET /orders/suggestions — "For you" on the home screen, from the customer's own orders. */
  @Get("suggestions")
  async suggestions(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.suggest.forCustomer(user.id);
  }

  /** GET /orders/request/:requestId — did this checkout already become an order? (asked after a lost reply) */
  @Get("request/:requestId")
  async byRequest(@Headers("authorization") auth: string | undefined, @Param("requestId", new ParseUUIDPipe()) requestId: string) {
    const user = await requireUser(this.supabase, auth);
    return this.orders.findByRequest(user.id, requestId);
  }

  /** POST /orders — place an order from the cart. */
  @Post()
  async place(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(placeOrderSchema, body);
    const result = await this.orders.placeOrder(user.id, input);
    // Best single offer (automatic or the typed coupon) comes off the items total.
    // A repeat of a checkout already placed: the offer and the shop were handled the first time.
    if (!result.replayed) await this.offers.applyToOrder(user.id, result.orderId, input.couponCode).catch((e) => console.error("[offers] apply", e));
    const { data: placed } = await this.supabase.admin.from("orders").select("est_amount, discount_amount").eq("id", result.orderId).single();
    if (placed) Object.assign(result, { estAmount: Number(placed.est_amount), discount: Number(placed.discount_amount ?? 0) });
    // Offer the order to the nearest open shop; a failure here never blocks checkout.
    if (!result.replayed) await this.assignment.offer(result.orderId).catch((e) => console.error("[assign] offer", e));
    return result;
  }

  /** POST /orders/grocery — place a grocery basket; the server split it into one order per shop. */
  @Post("grocery")
  async placeGrocery(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(placeGroceryOrderSchema, body);
    const result = await this.orders.placeGroceryOrder(user.id, input);
    // Each order goes straight to the shop the server chose (same accept window + ring).
    for (const o of result.replayed ? [] : result.orders) {
      await this.assignment.offerTo(o.orderId, o.dealerId).catch((e) => console.error("[assign] grocery offer", e));
    }
    return result;
  }

  /**
   * GET /orders/:id/queue — where this order sits in the rider's trip:
   * { position: 2, total: 3 } means one delivery comes before it. null when
   * the order isn't on a trip (or is already handled).
   */
  @Get(":id/queue")
  async queue(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, customer_id").eq("id", id).maybeSingle();
    if (!order || order.customer_id !== user.id) throw new ForbiddenException("Not your order");
    const { data: stop } = await db.from("trip_stops").select("trip_id, delivered_at, failed_at").eq("order_id", id).maybeSingle();
    if (!stop || stop.delivered_at || stop.failed_at) return null;
    const { data: open } = await db
      .from("trip_stops")
      .select("order_id, seq")
      .eq("trip_id", stop.trip_id)
      .is("delivered_at", null)
      .is("failed_at", null)
      .order("seq");
    const position = (open ?? []).findIndex((s) => s.order_id === id) + 1;
    return position > 0 ? { position, total: open!.length } : null;
  }

  /**
   * GET /orders/:id/rider-contact — who to call about this order's delivery.
   * Today the rider's real number; later a masked number from the same
   * endpoint, with no app change. null until a rider has accepted.
   */
  @Get(":id/rider-contact")
  async riderContact(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, customer_id, rider_id").eq("id", id).maybeSingle();
    if (!order || order.customer_id !== user.id) throw new ForbiddenException("Not your order");
    if (!order.rider_id) return null;
    const { data: rider } = await db.from("delivery_partners").select("vehicle, profiles(full_name, phone)").eq("id", order.rider_id).maybeSingle();
    const p = rider?.profiles as unknown as { full_name: string | null; phone: string | null } | null;
    return { name: p?.full_name ?? null, phone: p?.phone ? `+${p.phone}` : null, vehicle: rider?.vehicle ?? null };
  }

  /** Road routes already fetched, by order: the shop and the house don't move, so one lookup per order. */
  private readonly routes = new Map<string, { lat: number; lng: number }[]>();

  /**
   * GET /orders/:id/route — the road from the shop to the customer's house,
   * as points for the tracking map. null without GOOGLE_MAPS_SERVER_KEY or
   * when Google has no route; the app then draws its straight dashed line.
   */
  @Get(":id/route")
  async route(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    const { data: order } = await this.supabase.admin.from("orders").select("id, customer_id, pickup_lat, pickup_lng, dealers(lat, lng), addresses(lat, lng)").eq("id", id).maybeSingle();
    if (!order || order.customer_id !== user.id) throw new ForbiddenException("Not your order");
    const cached = this.routes.get(id);
    if (cached) return { points: cached };
    const key = process.env.GOOGLE_MAPS_SERVER_KEY;
    const home = order.addresses as unknown as { lat: number | null; lng: number | null } | null;
    // Orders picked up before the pickup point was saved fall back to the shop's own pin.
    const shop = order.dealers as unknown as { lat: number | null; lng: number | null } | null;
    const fromLat = order.pickup_lat ?? shop?.lat;
    const fromLng = order.pickup_lng ?? shop?.lng;
    if (!key || fromLat == null || fromLng == null || home?.lat == null || home?.lng == null) return null;
    try {
      // Routes API (the legacy Directions API is closed to new Google Cloud projects).
      const res = (await (
        await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
            destination: { location: { latLng: { latitude: home.lat, longitude: home.lng } } },
            travelMode: "TWO_WHEELER",
          }),
        })
      ).json()) as { routes?: { polyline?: { encodedPolyline?: string } }[]; error?: { message?: string } };
      const encoded = res.routes?.[0]?.polyline?.encodedPolyline;
      if (!encoded) {
        console.warn("[route]", res.error?.message ?? "no route");
        return null;
      }
      const points = decodePolyline(encoded);
      if (this.routes.size > 500) this.routes.clear();
      this.routes.set(id, points);
      return { points };
    } catch (e) {
      console.warn("[route]", (e as Error).message);
      return null;
    }
  }

  /** GET /orders/:id/rating — what this customer rated, or null. */
  @Get(":id/rating")
  async rating(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    return this.orders.getRating(user.id, id);
  }

  /** POST /orders/:id/rating — rate the items, the rider and the app on a delivered order. */
  @Post(":id/rating")
  async rate(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.orders.rateOrder(user.id, id, parse(rateOrderSchema, body));
  }

  /** POST /orders/:id/items — add to an order the customer just placed; 409 once the shop has accepted. */
  @Post(":id/items")
  async addItems(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.orders.addItems(user.id, id, parse(addOrderItemsSchema, body));
  }

  /** POST /orders/:id/cancel — customer cancels their own order (only until the shop accepts). */
  @Post(":id/cancel")
  async cancel(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(cancelOrderSchema, body);
    return this.orders.cancelByCustomer(user.id, id, input);
  }

  /**
   * POST /orders/transition
   * Applies a state change. Role checks per transition (dealer can only
   * ACCEPT/PACK, rider only PICK_UP/DELIVER, etc.) come next.
   */
  @Post("transition")
  async transition(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(transitionBody, body);
    return this.orders.transition({ ...input, actorId: user.id });
  }
}
