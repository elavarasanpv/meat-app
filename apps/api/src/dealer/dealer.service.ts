import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DealerAcceptInput, DealerRejectInput, ItemPhotoInput, ItemUnavailableInput, ShopStateInput, StockInput, WeighItemInput } from "@freshcut/shared";
import { DELIVERY_FEE, FREE_DELIVERY_ABOVE } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { OrdersService } from "../orders/orders.service";
import { AssignmentService } from "./assignment.service";

/** Statuses during which the shop is still working on the order. */
const SHOP_ACTIVE = ["DEALER_ASSIGNED", "ACCEPTED", "PACKING", "PACKED"];

@Injectable()
export class DealerService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly orders: OrdersService,
    private readonly assignment: AssignmentService,
  ) {}

  /** The caller's dealer row, or 403. */
  async resolveDealer(profileId: string) {
    const { data } = await this.supabase.admin
      .from("dealers")
      .select("id, profile_id, shop_name, is_open, closed_until, lat, lng")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) throw new ForbiddenException("Not a dealer");
    return data;
  }

  /** The dealer's open orders with items, priced at the SHOP price. */
  async listOrders(dealerId: string) {
    const db = this.supabase.admin;
    const { data: orders, error } = await db
      .from("orders")
      .select(
        "id, display_id, status, ready_by, est_amount, created_at, delivery_slots(starts_at, ends_at), order_items(id, product_id, requested_kg, actual_kg, size, notes, unavailable, unit_price_per_kg, products(name, name_ta, unit))",
      )
      .eq("dealer_id", dealerId)
      .in("status", SHOP_ACTIVE)
      .order("created_at", { ascending: false });
    if (error) throw new BadRequestException(error.message);

    // Shop (cost) prices for this dealer; fall back to the selling price.
    const { data: prices } = await db.from("dealer_products").select("product_id, price_per_kg").eq("dealer_id", dealerId);
    const shopPrice = new Map((prices ?? []).map((p) => [p.product_id, p.price_per_kg == null ? null : Number(p.price_per_kg)]));

    // The 5-minute countdown for offers still waiting on this dealer.
    const { data: pending } = await db
      .from("order_assignments")
      .select("order_id, deadline_at")
      .eq("dealer_id", dealerId)
      .eq("outcome", "pending");
    const deadlines = new Map((pending ?? []).map((p) => [p.order_id, p.deadline_at]));

    // Scale photo already taken for each item (latest per item).
    const ids = (orders ?? []).map((o) => o.id);
    const { data: proofs } = ids.length
      ? await db.from("order_proofs").select("order_item_id, photo_path, created_at").in("order_id", ids).eq("type", "packed").order("created_at")
      : { data: [] as { order_item_id: string | null; photo_path: string }[] };
    const photoOf = new Map((proofs ?? []).filter((p) => p.order_item_id).map((p) => [p.order_item_id as string, p.photo_path]));

    return (orders ?? []).map((o) => ({
      ...o,
      accept_deadline: deadlines.get(o.id) ?? null,
      order_items: (o.order_items as Record<string, unknown>[]).map((it) => ({
        ...it,
        shop_price_per_kg: shopPrice.get(it.product_id as string) ?? Number(it.unit_price_per_kg),
        photo_path: photoOf.get(it.id as string) ?? null,
      })),
    }));
  }

  /** Today at a glance: counts per stage and today's sales at shop prices. */
  async summary(dealerId: string) {
    const db = this.supabase.admin;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [{ data: active }, { data: today }] = await Promise.all([
      db.from("orders").select("status").eq("dealer_id", dealerId).in("status", SHOP_ACTIVE),
      db
        .from("orders")
        .select("status, order_items(product_id, requested_kg, actual_kg, unavailable)")
        .eq("dealer_id", dealerId)
        .gte("created_at", dayStart.toISOString()),
    ]);
    const shopPrice = await this.shopPrices(dealerId);
    const count = (s: string[]) => (active ?? []).filter((o) => s.includes(o.status)).length;
    let doneCount = 0;
    let sales = 0;
    for (const o of today ?? []) {
      if (["CANCELLED", "RETURNED", "REFUNDED", "DELIVERY_FAILED"].includes(o.status)) continue;
      doneCount += 1;
      for (const it of o.order_items as { product_id: string; requested_kg: number; actual_kg: number | null; unavailable: boolean }[]) {
        if (it.unavailable) continue;
        sales += Math.round((shopPrice.get(it.product_id) ?? 0) * Number(it.actual_kg ?? it.requested_kg));
      }
    }
    return {
      newCount: count(["DEALER_ASSIGNED"]),
      inProgressCount: count(["ACCEPTED", "PACKING"]),
      readyCount: count(["PACKED"]),
      todayOrders: doneCount,
      todaySales: sales,
    };
  }

  /** Finished orders (delivered / cancelled …), newest first, with the shop's amount. */
  async history(dealerId: string, limit = 50) {
    const db = this.supabase.admin;
    const { data, error } = await db
      .from("orders")
      .select("id, display_id, status, created_at, order_items(product_id, requested_kg, actual_kg, unavailable, products(name, name_ta))")
      .eq("dealer_id", dealerId)
      .not("status", "in", `(${SHOP_ACTIVE.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new BadRequestException(error.message);
    const shopPrice = await this.shopPrices(dealerId);
    return (data ?? []).map((o) => {
      const items = o.order_items as unknown as { product_id: string; requested_kg: number; actual_kg: number | null; unavailable: boolean; products: { name: string; name_ta: string | null } }[];
      const shopAmount = items
        .filter((i) => !i.unavailable)
        .reduce((s, i) => s + Math.round((shopPrice.get(i.product_id) ?? 0) * Number(i.actual_kg ?? i.requested_kg)), 0);
      return { id: o.id, display_id: o.display_id, status: o.status, created_at: o.created_at, shop_amount: shopAmount, items: items.map((i) => i.products) };
    });
  }

  private async shopPrices(dealerId: string) {
    const { data } = await this.supabase.admin.from("dealer_products").select("product_id, price_per_kg").eq("dealer_id", dealerId);
    return new Map((data ?? []).map((p) => [p.product_id as string, Number(p.price_per_kg ?? 0)]));
  }

  /** Accept the offer and promise a ready time. */
  async accept(profileId: string, input: DealerAcceptInput) {
    const dealer = await this.resolveDealer(profileId);
    const db = this.supabase.admin;
    const assignment = await this.pendingAssignment(input.orderId, dealer.id);

    const readyBy = new Date(Date.now() + input.readyMinutes * 60_000).toISOString();
    await this.orders.transition({ orderId: input.orderId, to: "ACCEPTED", actorId: profileId, note: `ready in ${input.readyMinutes} min` });
    await db.from("orders").update({ ready_by: readyBy }).eq("id", input.orderId);
    await db.from("order_assignments").update({ outcome: "accepted", responded_at: new Date().toISOString() }).eq("id", assignment.id);
    return { orderId: input.orderId, readyBy };
  }

  /** Turn the order down; it is immediately offered to the next shop. */
  async reject(profileId: string, input: DealerRejectInput) {
    const dealer = await this.resolveDealer(profileId);
    const assignment = await this.pendingAssignment(input.orderId, dealer.id);
    const reason = input.note ? `${input.reason}: ${input.note}` : input.reason;
    await this.supabase.admin
      .from("order_assignments")
      .update({ outcome: "rejected", reason, responded_at: new Date().toISOString() })
      .eq("id", assignment.id);
    const next = await this.assignment.offer(input.orderId);
    return { orderId: input.orderId, passedOn: next.assigned };
  }

  /**
   * One item cannot be supplied: drop it from the bill, tell the customer
   * (realtime picks up the change), and mark the product out of stock today.
   */
  async itemUnavailable(profileId: string, input: ItemUnavailableInput) {
    const dealer = await this.resolveDealer(profileId);
    const db = this.supabase.admin;
    const order = await this.ownedOrder(input.orderId, dealer.id, ["DEALER_ASSIGNED", "ACCEPTED", "PACKING"]);

    const items = order.order_items as { id: string; unavailable: boolean; requested_kg: number; unit_price_per_kg: number; product_id: string }[];
    const item = items.find((i) => i.id === input.orderItemId);
    if (!item) throw new NotFoundException("Item not found on this order");
    if (item.unavailable) throw new ConflictException("Already marked unavailable");
    if (items.filter((i) => !i.unavailable).length <= 1) {
      throw new BadRequestException("Last item — reject the whole order instead");
    }

    await db.from("order_items").update({ unavailable: true }).eq("id", item.id);

    // New estimate from the remaining items (same fee rule as create_order).
    const rest = items.filter((i) => !i.unavailable && i.id !== item.id);
    const itemsTotal = rest.reduce((sum, i) => sum + Math.round(Number(i.unit_price_per_kg) * Number(i.requested_kg)), 0);
    const estAmount = itemsTotal + (itemsTotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE);
    await db.from("orders").update({ est_amount: estAmount }).eq("id", input.orderId);
    await db.from("order_status_history").insert({
      order_id: input.orderId,
      from_status: order.status,
      to_status: order.status,
      actor_id: profileId,
      note: `item unavailable: ${item.product_id}`,
    });

    // Out of stock for the rest of the day (12 h), so new orders skip this shop.
    await db.from("dealer_products").upsert({
      dealer_id: dealer.id,
      product_id: item.product_id,
      out_of_stock_until: new Date(Date.now() + 12 * 3600_000).toISOString(),
    });
    return { orderId: input.orderId, estAmount };
  }

  /** The shop started cutting — the customer's journey moves to "Cutting". */
  async startCutting(profileId: string, orderId: string) {
    const dealer = await this.resolveDealer(profileId);
    await this.ownedOrder(orderId, dealer.id, ["ACCEPTED"]);
    return this.orders.transition({ orderId, to: "PACKING", actorId: profileId });
  }

  /** Record one item's actual packed weight (and its scale photo). */
  async weighItem(profileId: string, input: WeighItemInput) {
    const dealer = await this.resolveDealer(profileId);
    const db = this.supabase.admin;
    const order = await this.ownedOrder(input.orderId, dealer.id, ["PACKING"]);
    const item = (order.order_items as { id: string; unavailable: boolean }[]).find((i) => i.id === input.orderItemId);
    if (!item) throw new NotFoundException("Item not found on this order");
    if (item.unavailable) throw new BadRequestException("Item was marked unavailable");

    await db.from("order_items").update({ actual_kg: input.actualQty }).eq("id", item.id);
    if (input.photoPath) {
      await db.from("order_proofs").insert({
        order_id: input.orderId,
        type: "packed",
        photo_path: input.photoPath,
        weight_kg: input.actualQty,
        created_by: profileId,
      });
    }
    return { orderItemId: item.id, actualQty: input.actualQty };
  }

  /**
   * Photo of one packed item on the weighing scale — the shop's proof that at
   * least the ordered weight was packed. A retake replaces the earlier photo.
   */
  async itemPhoto(profileId: string, input: ItemPhotoInput) {
    const dealer = await this.resolveDealer(profileId);
    const db = this.supabase.admin;
    const order = await this.ownedOrder(input.orderId, dealer.id, ["PACKING"]);
    const item = (order.order_items as { id: string; unavailable: boolean }[]).find((i) => i.id === input.orderItemId);
    if (!item) throw new NotFoundException("Item not found on this order");
    if (item.unavailable) throw new BadRequestException("Item was marked unavailable");
    if (!input.photoPath.startsWith(`${input.orderId}/`)) throw new BadRequestException("Photo is not stored under this order");

    await db.from("order_proofs").delete().eq("order_item_id", item.id).eq("type", "packed");
    const { error } = await db.from("order_proofs").insert({
      order_id: input.orderId,
      order_item_id: item.id,
      type: "packed",
      photo_path: input.photoPath,
      created_by: profileId,
    });
    if (error) throw new BadRequestException(error.message);
    return { orderItemId: item.id, photoPath: input.photoPath };
  }

  /**
   * Every item photographed on the scale → PACKED (rider next).
   * The customer pays exactly what they saw: the bill is the ordered quantity
   * at the checkout price (minus any item the shop could not supply).
   */
  async packed(profileId: string, orderId: string) {
    const dealer = await this.resolveDealer(profileId);
    const db = this.supabase.admin;
    const order = await this.ownedOrder(orderId, dealer.id, ["PACKING"]);

    const items = (order.order_items as { id: string; unavailable: boolean; requested_kg: number; unit_price_per_kg: number }[]).filter((i) => !i.unavailable);
    const { data: proofs } = await db.from("order_proofs").select("order_item_id").eq("order_id", orderId).eq("type", "packed");
    const shot = new Set((proofs ?? []).map((p) => p.order_item_id));
    const missing = items.filter((i) => !shot.has(i.id)).length;
    if (missing) throw new BadRequestException(`${missing} item(s) still need a photo on the scale`);

    const itemsTotal = items.reduce((sum, i) => sum + Math.round(Number(i.unit_price_per_kg) * Number(i.requested_kg)), 0);
    const finalAmount = itemsTotal + (itemsTotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE);
    await db.from("orders").update({ final_amount: finalAmount }).eq("id", orderId);
    const result = await this.orders.transition({ orderId, to: "PACKED", actorId: profileId });
    return { ...result, finalAmount };
  }

  /** Open/close the shop now, or close it until a date. */
  async shopState(profileId: string, input: ShopStateInput) {
    const dealer = await this.resolveDealer(profileId);
    const patch: Record<string, unknown> = {};
    if (input.isOpen !== undefined) patch.is_open = input.isOpen;
    if (input.closedUntil !== undefined) patch.closed_until = input.closedUntil;
    if (!Object.keys(patch).length) throw new BadRequestException("Nothing to change");
    const { error } = await this.supabase.admin.from("dealers").update(patch).eq("id", dealer.id);
    if (error) throw new BadRequestException(error.message);
    return { ...patch };
  }

  /** Stock switch for one product: in stock, out today, or out until turned on. */
  async setStock(profileId: string, input: StockInput) {
    const dealer = await this.resolveDealer(profileId);
    const { error } = await this.supabase.admin.from("dealer_products").upsert({
      dealer_id: dealer.id,
      product_id: input.productId,
      out_of_stock_until: input.outOfStockUntil,
    });
    if (error) throw new BadRequestException(error.message);
    return { productId: input.productId, outOfStockUntil: input.outOfStockUntil };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async pendingAssignment(orderId: string, dealerId: string) {
    const { data } = await this.supabase.admin
      .from("order_assignments")
      .select("id, deadline_at")
      .eq("order_id", orderId)
      .eq("dealer_id", dealerId)
      .eq("outcome", "pending")
      .maybeSingle();
    if (!data) throw new ConflictException("This order is no longer offered to you");
    return data;
  }

  private async ownedOrder(orderId: string, dealerId: string, statuses: string[]) {
    const { data: order } = await this.supabase.admin
      .from("orders")
      .select("id, status, dealer_id, order_items(id, product_id, requested_kg, actual_kg, unit_price_per_kg, unavailable)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.dealer_id !== dealerId) throw new NotFoundException("Order not found");
    if (!statuses.includes(order.status)) throw new ConflictException(`Order is ${order.status}`);
    return order;
  }
}
