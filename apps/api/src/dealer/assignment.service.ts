import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SCHEDULED_AFTER_MIN, SHOP_REGION_KM, haversineKm, shopServes } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";
import { OrdersService } from "../orders/orders.service";

/**
 * How long a shop is expected to answer in. A meat offer is not taken away
 * after this: it is only tracked, and the other shops get to see the order too.
 * A grocery offer (one shop, picked by the customer) still times out.
 */
export const ACCEPT_WINDOW_MIN = 5;
const SWEEP_MS = 30_000;
/** How long an order that no shop could take keeps being retried. */
const RETRY_FOR_H = 24;
/** A shop that has not answered is rung again this often… */
const RERING_EVERY_MIN = 5;
/** …for this long after the offer… */
const RERING_FOR_MIN = 30;
/** …and again from this long before the delivery slot (the morning ring for a night order). */
const SLOT_RING_MIN = 120;

const IST_MS = 5.5 * 3600_000;
type Slot = { starts_at: string; ends_at: string };
const one = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/**
 * Offers each new meat order to the nearest shop that
 * serves the address (pincode on its list, or within 5 km) → is open right now → has every item in stock.
 * The offer stays in that shop's New tab until someone accepts or rejects it.
 * After 5 minutes with no answer every other shop that can serve it is offered
 * it too (first to accept gets it) and waiting shops are rung again. A shop
 * that rejects is not asked again. The sweeper also keeps trying orders no
 * shop could take when they were placed.
 */
@Injectable()
export class AssignmentService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly orders: OrdersService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep().catch((e) => console.error("[assign] sweep", e)), SWEEP_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Offer the order to the best shop that has not been tried yet. */
  async offer(orderId: string, opts: { retry?: boolean; all?: boolean } = {}): Promise<{ assigned: boolean; dealerId?: string }> {
    const db = this.supabase.admin;
    const { data: order } = await db
      .from("orders")
      .select("id, status, dealer_id, vertical_type, addresses(pincode, lat, lng), order_items(product_id, unavailable)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || !["PLACED", "DEALER_ASSIGNED"].includes(order.status)) return { assigned: false };
    // Grocery: the customer chose the shop, so there is nobody else to try.
    // Ring the same shop again (up to 3 offers), then leave it for admin.
    if (order.vertical_type === "grocery") {
      if (!order.dealer_id) return { assigned: false };
      const { count } = await db.from("order_assignments").select("id", { count: "exact", head: true }).eq("order_id", orderId);
      if ((count ?? 0) >= 3) {
        console.warn(`[assign] grocery order ${orderId}: shop did not answer after ${count} offers`);
        return { assigned: false };
      }
      return this.offerTo(orderId, order.dealer_id);
    }
    const addr = order.addresses as unknown as { pincode: string; lat: number | null; lng: number | null } | null;
    if (!addr) return { assigned: false };

    const needed = (order.order_items as { product_id: string; unavailable: boolean }[])
      .filter((i) => !i.unavailable)
      .map((i) => i.product_id);

    // Meat shops serving this address (the region rule) and open right now
    const now = new Date().toISOString();
    const { data: rows } = await db
      .from("dealers")
      .select("id, profile_id, lat, lng, is_open, closed_until, dealer_pincodes(pincode)")
      .eq("is_active", true)
      .eq("store_type", "meat");
    const open = ((rows ?? []) as unknown as { id: string; profile_id: string; lat: number | null; lng: number | null; is_open: boolean; closed_until: string | null; dealer_pincodes: { pincode: string }[] }[])
      .filter((d) => shopServes({ lat: d.lat, lng: d.lng, pincodes: d.dealer_pincodes.map((x) => x.pincode) }, addr, SHOP_REGION_KM))
      .filter((d) => d.is_open && (!d.closed_until || d.closed_until <= now));

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

    // Shops still holding an open offer for this order.
    const { data: stillOpen } = await db.from("order_assignments").select("dealer_id").eq("order_id", orderId).eq("outcome", "pending");
    const waitingIds = (stillOpen ?? []).map((x) => x.dealer_id as string);

    if (!candidates.length) {
      if (waitingIds.length) {
        // Other shops still have it: keep the order on one of them.
        if (!order.dealer_id || !waitingIds.includes(order.dealer_id)) await db.from("orders").update({ dealer_id: waitingIds[0] }).eq("id", orderId);
        return { assigned: false };
      }
      // Nobody left to try: flag for admin, leave the order where it is.
      if (order.dealer_id) await db.from("orders").update({ dealer_id: null }).eq("id", orderId);
      // The sweeper retries waiting orders every 30 s; log once, not on every retry.
      if (!opts.retry && !opts.all) console.warn(`[assign] no shop available for order ${orderId} (pincode ${addr.pincode})`);
      return { assigned: false };
    }

    // Nearest first (haversine; shops without a pin go last)
    candidates.sort((a, b) => this.distance(a, addr) - this.distance(b, addr));
    // One shop at first; once it has not answered in time, everyone who can serve it.
    const chosen = opts.all ? candidates : [candidates[0]];

    const deadline = new Date(Date.now() + ACCEPT_WINDOW_MIN * 60_000).toISOString();
    const { error } = await db.from("order_assignments").insert(chosen.map((d) => ({ order_id: orderId, dealer_id: d.id, deadline_at: deadline })));
    if (error) throw new Error(error.message);
    // The order sits on the first shop that still has it open.
    if (!order.dealer_id || !waitingIds.includes(order.dealer_id)) await db.from("orders").update({ dealer_id: chosen[0].id }).eq("id", orderId);
    if (order.status === "PLACED") {
      await this.orders.transition({ orderId, to: "DEALER_ASSIGNED", actorId: chosen[0].profile_id, note: "offered to shop" });
    }
    // Ring the shops' phones (even with the app closed). Never blocks the offer.
    for (const d of chosen) void this.ringShop(orderId, d.profile_id);
    if (opts.all) console.log(`[assign] order ${orderId} shown to ${chosen.length} more shop(s)`);
    return { assigned: true, dealerId: chosen[0].id };
  }

  /** Offer the order to one specific shop (grocery: the one the customer picked). */
  async offerTo(orderId: string, dealerId: string): Promise<{ assigned: boolean; dealerId?: string }> {
    const db = this.supabase.admin;
    const [{ data: order }, { data: dealer }] = await Promise.all([
      db.from("orders").select("id, status").eq("id", orderId).maybeSingle(),
      db.from("dealers").select("id, profile_id").eq("id", dealerId).maybeSingle(),
    ]);
    if (!order || !dealer || !["PLACED", "DEALER_ASSIGNED"].includes(order.status)) return { assigned: false };
    const deadline = new Date(Date.now() + ACCEPT_WINDOW_MIN * 60_000).toISOString();
    const { error } = await db.from("order_assignments").insert({ order_id: orderId, dealer_id: dealer.id, deadline_at: deadline });
    if (error) throw new Error(error.message);
    await db.from("orders").update({ dealer_id: dealer.id }).eq("id", orderId);
    if (order.status === "PLACED") {
      await this.orders.transition({ orderId, to: "DEALER_ASSIGNED", actorId: dealer.profile_id, note: "offered to shop" });
    }
    void this.ringShop(orderId, dealer.profile_id);
    return { assigned: true, dealerId: dealer.id };
  }

  /** Offers past their 5 minutes (share meat orders with the other shops and ring again; time out grocery), waiting orders, prep reminders. */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const db = this.supabase.admin;
      const now = new Date().toISOString();
      const { data: lapsed } = await db
        .from("order_assignments")
        .select("id, order_id, offered_at, orders!inner(status, vertical_type, delivery_slots(starts_at, ends_at)), dealers(profile_id)")
        .eq("outcome", "pending")
        .lt("deadline_at", now)
        .order("deadline_at")
        .limit(100);
      const shared = new Set<string>();
      for (const a of lapsed ?? []) {
        const o = a.orders as unknown as { status: string; vertical_type: string; delivery_slots: Slot | Slot[] | null };
        if (o.status !== "DEALER_ASSIGNED") {
          // Order moved on (accepted elsewhere/cancelled): close the offer quietly.
          await db.from("order_assignments").update({ outcome: "cancelled", responded_at: now }).eq("id", a.id).eq("outcome", "pending");
          continue;
        }
        if (o.vertical_type === "grocery") {
          await db.from("order_assignments").update({ outcome: "timeout", responded_at: now }).eq("id", a.id).eq("outcome", "pending");
          await this.offer(a.order_id);
          continue;
        }
        // Meat: the offer stays. Show the order to every other shop that can
        // serve it (also one that opened or restocked since), once per sweep.
        if (!shared.has(a.order_id)) {
          shared.add(a.order_id);
          await this.offer(a.order_id, { all: true });
        }
        // Ring this shop again: every few minutes for the first half hour, and
        // again in the hours before the slot (the morning ring for a night order).
        const t = Date.now();
        const slot = one(o.delivery_slots);
        const fresh = t - new Date(a.offered_at).getTime() <= RERING_FOR_MIN * 60_000;
        const nearSlot = !!slot && t >= new Date(slot.starts_at).getTime() - SLOT_RING_MIN * 60_000 && t <= new Date(slot.ends_at).getTime();
        if (!fresh && !nearSlot) continue;
        const before = new Date(t - RERING_EVERY_MIN * 60_000).toISOString();
        // Claim the ring first, so two sweeps never ring twice. No column yet (migration 0043 not run): no re-rings.
        const { data: claimed, error } = await db
          .from("order_assignments")
          .update({ last_rung_at: now })
          .eq("id", a.id)
          .eq("outcome", "pending")
          .or(`last_rung_at.is.null,last_rung_at.lt.${before}`)
          .select("id");
        if (error || !claimed?.length) continue;
        const profileId = one(a.dealers as unknown as { profile_id: string } | { profile_id: string }[] | null)?.profile_id;
        if (profileId) void this.ringShop(a.order_id, profileId, new Date(a.offered_at).getTime());
      }

      // Orders no shop could take when placed (all closed, or none had the
      // items) wait with no shop. Try them again, so a shop that opens or
      // restocks later gets them without an admin stepping in.
      const since = new Date(Date.now() - RETRY_FOR_H * 3600_000).toISOString();
      const { data: waiting } = await db
        .from("orders")
        .select("id")
        .eq("status", "PLACED")
        .eq("vertical_type", "meat")
        .is("dealer_id", null)
        .gte("created_at", since)
        .order("created_at")
        .limit(20);
      for (const o of waiting ?? []) {
        const r = await this.offer(o.id, { retry: true });
        if (r.assigned) console.log(`[assign] order ${o.id} offered on retry`);
      }

      // For-later orders the shop accepted earlier: ring it when it is time to prepare.
      const { data: due } = await db
        .from("orders")
        .select("id, display_id, delivery_slots(starts_at, ends_at), dealers(profile_id)")
        .eq("status", "ACCEPTED")
        .lte("prep_remind_at", now)
        .limit(20);
      for (const o of due ?? []) {
        const { data: mine } = await db.from("orders").update({ prep_remind_at: null }).eq("id", o.id).not("prep_remind_at", "is", null).select("id");
        if (!mine?.length) continue;
        const profileId = one(o.dealers as { profile_id: string } | { profile_id: string }[] | null)?.profile_id;
        const slot = one(o.delivery_slots as { starts_at: string; ends_at: string } | { starts_at: string; ends_at: string }[] | null);
        if (profileId) void this.remindShop(o.id, o.display_id, profileId, slot ?? null);
      }
    } finally {
      this.sweeping = false;
    }
  }

  /** Ring a shop about an order. `waitingSince` set: it was rung before and has not answered. */
  private async ringShop(orderId: string, profileId: string, waitingSince?: number) {
    try {
      const { data: o } = await this.supabase.admin
        .from("orders")
        .select("display_id, vertical_type, delivery_slots(starts_at, ends_at), order_items(id, unavailable)")
        .eq("id", orderId)
        .single();
      const n = ((o?.order_items as { unavailable: boolean }[]) ?? []).filter((i) => !i.unavailable).length;
      const id = o?.display_id ?? "";
      const slot = one(o?.delivery_slots as Slot | Slot[] | null | undefined);
      // A meat order for a later slot says so, so the shop does not start cutting at night.
      const later = o?.vertical_type === "meat" && !!slot && new Date(slot.starts_at).getTime() - Date.now() > SCHEDULED_AFTER_MIN * 60_000;
      const when = slot ? slotWords(slot) : null;
      const items = { en: `${n} item${n === 1 ? "" : "s"}`, ta: `${n} பொருள்${n === 1 ? "" : "கள்"}` };
      let en: { title: string; body: string };
      let ta: { title: string; body: string };
      if (waitingSince != null) {
        const mins = Math.max(1, Math.round((Date.now() - waitingSince) / 60_000));
        const waited = mins < 60 ? { en: `${mins} min`, ta: `${mins} நிமிடம்` } : { en: `${Math.floor(mins / 60)} hr ${mins % 60} min`, ta: `${Math.floor(mins / 60)} மணி ${mins % 60} நிமிடம்` };
        en = { title: `Order ${id} is waiting`, body: `${when ? `For ${when.en} · ` : ""}waiting ${waited.en} · please accept` };
        ta = { title: `ஆர்டர் ${id} காத்திருக்கிறது`, body: `${when ? `${when.ta} · ` : ""}${waited.ta} காத்திருக்கிறது · ஏற்றுக்கொள்ளுங்கள்` };
      } else if (later && when) {
        en = { title: `New order ${id} for ${when.en}`, body: `${items.en} · accept now, prepare later` };
        ta = { title: `புதிய ஆர்டர் ${id} · ${when.ta}`, body: `${items.ta} · இப்போது ஏற்கவும், பிறகு தயார் செய்யவும்` };
      } else {
        en = { title: `New order ${id}`.trim(), body: `${items.en} · please accept now` };
        ta = { title: `புதிய ஆர்டர் ${id}`.trim(), body: `${items.ta} · இப்போதே ஏற்றுக்கொள்ளுங்கள்` };
      }
      await this.push.toProfiles([profileId], { ...en, ta, data: { kind: "new_order", orderId }, channelId: "orders" });
    } catch (e) {
      console.warn("[push] ringShop", (e as Error).message);
    }
  }

  private async remindShop(orderId: string, displayId: string, profileId: string, slot: { starts_at: string; ends_at: string } | null) {
    try {
      const window = slot ? `${clockIst(slot.starts_at)} – ${clockIst(slot.ends_at)}` : "";
      await this.push.toProfiles([profileId], {
        title: `Time to prepare ${displayId}`,
        body: window ? `Delivery slot ${window}. Start cutting now.` : "Start cutting now.",
        ta: { title: `${displayId} தயார் செய்யும் நேரம்`, body: window ? `டெலிவரி நேரம் ${window}. இப்போது வெட்ட தொடங்குங்கள்.` : "இப்போது வெட்ட தொடங்குங்கள்." },
        data: { kind: "prep_reminder", orderId },
        channelId: "orders",
      });
      console.log(`[assign] order ${orderId} prep reminder sent`);
    } catch (e) {
      console.warn("[push] remindShop", (e as Error).message);
    }
  }

  private distance(d: { lat: number | null; lng: number | null }, addr: { lat: number | null; lng: number | null }) {
    if (d.lat == null || d.lng == null || addr.lat == null || addr.lng == null) return Number.MAX_SAFE_INTEGER;
    return haversineKm({ lat: d.lat, lng: d.lng }, { lat: addr.lat, lng: addr.lng });
  }
}

function clockIst(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** "Tomorrow 7:00 am – 9:00 am", with the day as the shop in India sees it. */
function slotWords(slot: Slot): { en: string; ta: string } {
  const day = (ms: number) => Math.floor((ms + IST_MS) / 86_400_000);
  const days = day(new Date(slot.starts_at).getTime()) - day(Date.now());
  const window = `${clockIst(slot.starts_at)} – ${clockIst(slot.ends_at)}`;
  const date = new Date(slot.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return {
    en: `${days === 0 ? "today" : days === 1 ? "tomorrow" : date} ${window}`,
    ta: `${days === 0 ? "இன்று" : days === 1 ? "நாளை" : date} ${window}`,
  };
}
