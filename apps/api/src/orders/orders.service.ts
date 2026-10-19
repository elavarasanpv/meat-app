import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { canTransition, type OrderStatus } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";

@Injectable()
export class OrdersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * The single gate for every order status change.
   * Validates the transition, updates the row, and appends to history.
   * TODO: wrap in a Postgres function (rpc) for true atomicity.
   */
  async transition(params: {
    orderId: string;
    to: OrderStatus;
    actorId: string;
    note?: string;
    lat?: number;
    lng?: number;
  }) {
    const { orderId, to, actorId, note, lat, lng } = params;
    const db = this.supabase.admin;

    const { data: order, error } = await db
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();
    if (error || !order) throw new NotFoundException("Order not found");

    const from = order.status as OrderStatus;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`Cannot move order from ${from} to ${to}`);
    }

    const { error: updateError } = await db
      .from("orders")
      .update({ status: to })
      .eq("id", orderId)
      .eq("status", from); // optimistic lock on current status
    if (updateError) throw new BadRequestException(updateError.message);

    await db.from("order_status_history").insert({
      order_id: orderId,
      from_status: from,
      to_status: to,
      actor_id: actorId,
      note,
      lat,
      lng,
    });

    return { orderId, from, to };
  }
}
