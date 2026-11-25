import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { CUSTOMER_CANCELLABLE, canTransition, type AddOrderItemsInput, type CancelOrderInput, type OrderStatus, type PlaceGroceryOrderInput, type PlaceOrderInput, type RateOrderInput } from "@thanjozmart/shared";
import { PushService } from "../push/push.service";
import { SupabaseService } from "../supabase.service";

@Injectable()
export class OrdersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
  ) {}

  /**
   * Place an order: generates the delivery OTP and calls place_order_once(),
   * which runs the atomic create_order() (prices, totals, display id, items,
   * history). A repeat of the same checkout (same requestId) returns the order
   * made the first time, with `replayed: true`.
   */
  async placeOrder(customerId: string, input: PlaceOrderInput) {
    const { rows, otp } = await this.placeOnce(customerId, "meat", input, input.items.map((i) => ({ product_id: i.productId, qty: i.qty, size: i.size ?? null, notes: i.notes ?? null })));
    const row = rows[0];
    return { orderId: row.order_id, displayId: row.display_id, estAmount: Number(row.est_amount), otp, replayed: row.replayed };
  }

  /**
   * Place a grocery basket. The customer never picks a shop: create_grocery_order()
   * splits the lines across the shops serving the pincode (fewest shops first)
   * and returns one row per order. Same OTP for the whole group, fee read from
   * delivery_fee_rules. Repeats of the same checkout get the same orders back.
   */
  async placeGroceryOrder(customerId: string, input: PlaceGroceryOrderInput) {
    const { rows, otp } = await this.placeOnce(customerId, "grocery", input, input.items.map((i) => ({ master_product_id: i.masterProductId, qty: i.qty, notes: i.notes ?? null })));
    const orders = rows.map((r) => ({ orderId: r.order_id, displayId: r.display_id, estAmount: Number(r.est_amount), dealerId: r.dealer_id as string }));
    // The first order carries the fee and the most lines; the app opens that one.
    return { ...orders[0], estAmount: orders.reduce((s, o) => s + o.estAmount, 0), otp, orders, replayed: rows[0].replayed };
  }

  private async placeOnce(customerId: string, vertical: "meat" | "grocery", input: Pick<PlaceOrderInput, "addressId" | "slot" | "paymentMode" | "requestId">, items: unknown[]) {
    const otp = String(randomInt(1000, 10000)); // 4 digits, never leading zero
    const otpHash = await bcrypt.hash(otp, 8);
    const { data, error } = await this.supabase.admin.rpc("place_order_once", {
      p_request: input.requestId ?? null,
      p_vertical: vertical,
      p_customer: customerId,
      p_address: input.addressId,
      p_slot_start: input.slot.startsAt,
      p_slot_end: input.slot.endsAt,
      p_payment: input.paymentMode,
      p_items: items,
      p_otp_hash: otpHash,
      p_otp: otp,
    });
    if (error) {
      if (error.code === "P0002") throw new NotFoundException(error.message);
      if (error.code === "FC409") throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    const rows = (Array.isArray(data) ? data : [data]) as { order_id: string; display_id: string; est_amount: number; dealer_id: string | null; otp: string | null; replayed: boolean }[];
    // A repeat carries the OTP stored the first time, not the one generated just now.
    return { rows, otp: rows[0].replayed ? (rows[0].otp ?? "") : otp };
  }

  /** The order a checkout id became, or null if that attempt never reached the database. */
  async findByRequest(customerId: string, requestId: string) {
    const { data } = await this.supabase.admin.from("orders").select("id, display_id, est_amount").eq("customer_id", customerId).eq("client_request_id", requestId).order("display_id").limit(1);
    const o = data?.[0];
    return { order: o ? { orderId: o.id as string, displayId: o.display_id as string, estAmount: Number(o.est_amount) } : null };
  }

  /**
   * Add items to a placed order. The SQL function holds the order's row lock,
   * so this and the shop's accept run one after the other: if the shop got
   * there first it raises FC409 and nothing is added.
   */
  async addItems(customerId: string, orderId: string, input: AddOrderItemsInput) {
    const { data, error } = await this.supabase.admin.rpc("add_order_items", {
      p_order: orderId,
      p_customer: customerId,
      p_items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty, size: i.size ?? null, notes: i.notes ?? null })),
    });
    if (error) {
      if (error.code === "FC409") throw new ConflictException(error.message);
      if (error.code === "P0002") throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    return { orderId, estAmount: Number(data) };
  }

  /** What the customer rated on this order, or null. */
  async getRating(customerId: string, orderId: string) {
    const db = this.supabase.admin;
    const [{ data: r }, { data: items }] = await Promise.all([
      db.from("order_ratings").select("rider_stars, rider_note, rider_tags, app_stars, app_note, created_at").eq("order_id", orderId).eq("customer_id", customerId).maybeSingle(),
      db.from("product_ratings").select("order_item_id, stars, note").eq("order_id", orderId).eq("customer_id", customerId),
    ]);
    if (!r) return null;
    return { rider: r.rider_stars ? { stars: r.rider_stars, note: r.rider_note, tags: (r.rider_tags as string[] | null) ?? [] } : null, app: r.app_stars ? { stars: r.app_stars, note: r.app_note } : null, items: items ?? [], createdAt: r.created_at };
  }

  /** Rate a delivered order: each item, the rider and the app. Saving again replaces the earlier rating. */
  async rateOrder(customerId: string, orderId: string, input: RateOrderInput) {
    const db = this.supabase.admin;
    const { data: order } = await db.from("orders").select("id, status, customer_id, rider_id, order_items(id, product_id)").eq("id", orderId).maybeSingle();
    if (!order || order.customer_id !== customerId) throw new NotFoundException("Order not found");
    if (order.status !== "DELIVERED") throw new BadRequestException("You can rate an order once it is delivered");
    const items = (order.order_items as { id: string; product_id: string }[]) ?? [];
    const byItem = new Map(items.map((i) => [i.id, i.product_id]));
    for (const it of input.items) if (!byItem.has(it.orderItemId)) throw new BadRequestException("That item is not on this order");

    const { error } = await db.from("order_ratings").upsert(
      {
        order_id: orderId,
        customer_id: customerId,
        rider_id: order.rider_id,
        rider_stars: input.rider?.stars ?? null,
        rider_note: input.rider?.note || null,
        rider_tags: input.rider?.tags ?? [],
        app_stars: input.app?.stars ?? null,
        app_note: input.app?.note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );
    if (error) throw new BadRequestException(error.message);
    if (input.items.length) {
      const rows = input.items.map((it) => ({ order_item_id: it.orderItemId, order_id: orderId, product_id: byItem.get(it.orderItemId)!, customer_id: customerId, stars: it.stars, note: it.note || null }));
      const { error: e2 } = await db.from("product_ratings").upsert(rows, { onConflict: "order_item_id" });
      if (e2) throw new BadRequestException(e2.message);
    }
    return { ok: true };
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

    void this.notifyCustomer(orderId, to);
    return { orderId, from, to };
  }

  /**
   * Tell the customer about the steps they care about, even with the app
   * closed. Arrival at the door has its own push (rider.controller) and
   * their own cancellation needs none. Fire-and-forget.
   */
  private async notifyCustomer(orderId: string, to: OrderStatus) {
    try {
      const { data: o } = await this.supabase.admin
        .from("orders")
        .select("customer_id, display_id, vertical_type, payment_mode, est_amount, final_amount, delivery_partners:rider_id(profiles(full_name))")
        .eq("id", orderId)
        .single();
      if (!o) return;
      const make = o.vertical_type === "grocery" && to in GROCERY_STATUS_PUSH ? GROCERY_STATUS_PUSH[to] : CUSTOMER_STATUS_PUSH[to];
      if (!make) return;
      const rider = o.delivery_partners as unknown as { profiles: { full_name: string | null } | null } | null;
      const text = make(riderFirstName(rider?.profiles?.full_name), cashLine(o.payment_mode, Number(o.final_amount ?? o.est_amount)));
      await this.push.toProfiles([o.customer_id], {
        title: text.title,
        body: `${o.display_id} · ${text.body}`,
        ta: { title: text.ta.title, body: `${o.display_id} · ${text.ta.body}` },
        data: { kind: "status", status: to, orderId },
        channelId: "delivery",
      });
    } catch (e) {
      console.warn("[push] status", (e as Error).message);
    }
  }
}

/** Customer-facing status pushes in English and Tamil; statuses missing here send nothing. */
type PushText = { title: string; body: string; ta: { title: string; body: string } };
/** What the rider is called in a push: their first name, or "Your rider" when we have none. */
export type RiderName = { en: string; ta: string };
export type CashLine = { en: string; ta: string };
type PushMaker = (rider: RiderName, cash: CashLine) => PushText;

export function riderFirstName(full: string | null | undefined): RiderName {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? { en: first, ta: first } : { en: "Your rider", ta: "உங்கள் ரைடர்" };
}

/** " Keep ₹161 ready." for cash orders, " Pay ₹161 by UPI at the door." for UPI on delivery, nothing when prepaid. */
export function cashLine(paymentMode: string | null | undefined, amount: number): CashLine {
  const rs = `₹${Math.round(amount)}`;
  if (paymentMode === "cod") return { en: ` Keep ${rs} ready.`, ta: ` ${rs} தயாராக வைத்திருங்கள்.` };
  if (paymentMode === "upi_on_delivery") return { en: ` Pay ${rs} by UPI at the door.`, ta: ` வாசலில் ${rs} UPI மூலம் செலுத்துங்கள்.` };
  return { en: "", ta: "" };
}

/** Grocery overrides: the shop accepts and packs in one go, so PACKED (automatic) stays silent. */
const GROCERY_STATUS_PUSH: Partial<Record<OrderStatus, PushMaker | undefined>> = {
  ACCEPTED: () => ({ title: "Shop accepted your order", body: "They're packing it now; a rider will be assigned soon.", ta: { title: "கடை உங்கள் ஆர்டரை ஏற்றது", body: "இப்போது பேக் செய்கிறார்கள்; விரைவில் ரைடர் ஒதுக்கப்படுவார்." } }),
  PACKED: undefined,
};
/** PICKED_UP is silent: pickup moves the order straight on to OUT_FOR_DELIVERY, which carries the "on the way" push. */
const CUSTOMER_STATUS_PUSH: Partial<Record<OrderStatus, PushMaker>> = {
  ACCEPTED: () => ({ title: "Shop accepted your order", body: "They're cutting it fresh for you now.", ta: { title: "கடை உங்கள் ஆர்டரை ஏற்றது", body: "உங்களுக்காக இப்போது புதிதாக வெட்டுகிறார்கள்." } }),
  PACKED: () => ({ title: "Your order is packed", body: "Weighed, photographed and waiting for a rider.", ta: { title: "உங்கள் ஆர்டர் பேக் ஆகிவிட்டது", body: "எடை போட்டு, புகைப்படம் எடுத்து, ரைடருக்காகக் காத்திருக்கிறது." } }),
  RIDER_ASSIGNED: (r) => ({ title: "Your rider is assigned", body: `${r.en} will collect your order and bring it to you.`, ta: { title: "உங்கள் ரைடர் ஒதுக்கப்பட்டார்", body: `${r.ta} உங்கள் ஆர்டரை எடுத்து வருவார்.` } }),
  OUT_FOR_DELIVERY: (r) => ({ title: "Your order is on the way!", body: `${r.en} has picked it up and is riding to you. Keep your delivery code ready.`, ta: { title: "உங்கள் ஆர்டர் வந்துகொண்டிருக்கிறது!", body: `${r.ta} ஆர்டரை எடுத்துக்கொண்டு உங்களை நோக்கி வருகிறார். டெலிவரி குறியீட்டைத் தயாராக வைத்திருங்கள்.` } }),
  DELIVERED: () => ({ title: "Delivered — enjoy!", body: "Tap to rate your order and the delivery.", ta: { title: "டெலிவரி ஆகிவிட்டது — ருசித்து மகிழுங்கள்!", body: "ஆர்டரையும் டெலிவரியையும் மதிப்பிட தட்டவும்." } }),
  DELIVERY_FAILED: () => ({ title: "We couldn't deliver your order", body: "Tap to see what happened and get help.", ta: { title: "உங்கள் ஆர்டரை டெலிவரி செய்ய முடியவில்லை", body: "என்ன நடந்தது என்று பார்க்கவும் உதவி பெறவும் தட்டவும்." } }),
};
