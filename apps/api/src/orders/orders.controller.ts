import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { cancelOrderSchema, orderStatusSchema, placeOrderSchema, upcomingSlots } from "@freshcut/shared";
import { OrdersService } from "./orders.service";
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

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly supabase: SupabaseService,
    private readonly assignment: AssignmentService,
  ) {}

  /** GET /orders/slots — delivery windows the customer can pick right now. */
  @Get("slots")
  slots() {
    return upcomingSlots();
  }

  /** POST /orders — place an order from the cart. */
  @Post()
  async place(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(placeOrderSchema, body);
    const result = await this.orders.placeOrder(user.id, input);
    // Offer the order to the nearest open shop; a failure here never blocks checkout.
    await this.assignment.offer(result.orderId).catch((e) => console.error("[assign] offer", e));
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
