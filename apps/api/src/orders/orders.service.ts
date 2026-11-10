import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { CUSTOMER_CANCELLABLE, canTransition, type CancelOrderInput, type OrderStatus, type PlaceOrderInput } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";

@Injectable()
export class OrdersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Place an order: generates the delivery OTP and calls the atomic
   * create_order() SQL function (prices, totals, display id, items, history).
   */
  async placeOrder(customerId: string, input: PlaceOrderInput) {
    const otp = String(randomInt(1000, 10000)); // 4 digits, never leading zero
    const otpHash = await bcrypt.hash(otp, 8);

    const { data, error } = await this.supabase.admin.rpc("create_order", {
      p_customer: customerId,
      p_address: input.addressId,
      p_slot_start: input.slot.startsAt,
      p_slot_end: input.slot.endsAt,
      p_payment: input.paymentMode,
      p_items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty, size: i.size ?? null, notes: i.notes ?? null })),
      p_otp_hash: otpHash,
      p_otp: otp,
    });
    if (error) {
      if (error.code === "P0002") throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; display_id: string; est_amount: number };
    return { orderId: row.order_id, displayId: row.display_id, estAmount: Number(row.est_amount), otp };
  }

  /** Customer-initiated cancel: must own the order and it must not be accepted yet. */
  async cancelByCustomer(customerId: string, orderId: string, input: CancelOrderInput) {
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, status, customer_id").eq("id", orderId).maybeSingle();
    if (!order || order.customer_id !== customerId) throw new NotFoundException("Order not found");
    if (!CUSTOMER_CANCELLABLE.includes(order.status as OrderStatus)) {
      throw new BadRequestException("This order can no longer be cancelled — please call support");
    }
    const reason = input.note ? `${input.reason}: ${input.note}` : input.reason;
    const result = await this.transition({ orderId, to: "CANCELLED", actorId: customerId, note: reason });
    await db.from("orders").update({ cancel_reason: reason }).eq("id", orderId);
    return result;
  }

  /**
   * The single gate for every order status change. Checks the move is allowed,
   * then transition_order() locks the row, re-checks the status, updates it
   * and writes history in one step. A concurrent change raises a conflict.
   */
  async transition(params: {
    orderId: string;
    to: OrderStatus;
    actorId: string;
    note?: string;
    lat?: number;
    lng?: number;
    /** A rider claiming the order: sets rider_id, and fails if another rider got it first. */
    riderId?: string;
  }) {
    const { orderId, to, actorId, note, lat, lng, riderId } = params;
    const db = this.supabase.admin;

    const { data: order, error } = await db.from("orders").select("id, status").eq("id", orderId).single();
    if (error || !order) throw new NotFoundException("Order not found");

    const from = order.status as OrderStatus;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`Cannot move order from ${from} to ${to}`);
    }

    const { error: rpcError } = await db.rpc("transition_order", {
      p_order: orderId,
      p_expected: from,
      p_to: to,
      p_actor: actorId,
      p_note: note ?? null,
      p_lat: lat ?? null,
      p_lng: lng ?? null,
      p_rider: riderId ?? null,
    });
    if (rpcError) {
      if (rpcError.code === "FC409") throw new ConflictException("This order was just updated by someone else. Refresh and try again.");
      if (rpcError.code === "P0002") throw new NotFoundException("Order not found");
      throw new BadRequestException(rpcError.message);
    }

    return { orderId, from, to };
  }
}
