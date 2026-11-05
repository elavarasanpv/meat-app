import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminRiderInput, AdminShopInput } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { OrdersService } from "../orders/orders.service";
import { AssignmentService } from "../dealer/assignment.service";
import { AdminService } from "./admin.service";
import type { AdminUser } from "./admin.guard";

/** A delivery taking longer than this from pickup to handover counts as late. */
const RIDER_LATE_MIN = 45;
const ACTIVE = ["PLACED", "DEALER_ASSIGNED", "ACCEPTED", "PACKING", "PACKED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];
const FILTERS: Record<string, string[]> = {
  active: ACTIVE,
  shop: ["PLACED", "DEALER_ASSIGNED", "ACCEPTED", "PACKING"],
  delivery: ["PACKED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"],
  delivered: ["DELIVERED"],
  problems: ["CANCELLED", "DELIVERY_FAILED", "RETURNED", "REFUNDED"],
};

type Name = { full_name: string | null; phone: string | null } | null;

/**
 * What the admin pages read and change: orders, shops, riders and cash.
 * Every change is written to the audit log through AdminService.log.
 */
@Injectable()
export class AdminOpsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly orders: OrdersService,
    private readonly assignment: AssignmentService,
    private readonly audit: AdminService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  // ───────────────────────────── orders ─────────────────────────────

  async listOrders(filter = "active", q = "") {
    let query = this.db
      .from("orders")
      .select(
        "id, display_id, status, payment_mode, est_amount, final_amount, created_at, ready_by, dealer_id, profiles!orders_customer_id_fkey(full_name, phone), dealers(shop_name), delivery_partners(profiles(full_name)), addresses(pincode)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (FILTERS[filter]) query = query.in("status", FILTERS[filter]);
    const term = q.trim();
    if (term) query = query.ilike("display_id", `%${term}%`);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    const now = Date.now();
    return (data ?? []).map((o) => {
      const c = o.profiles as unknown as Name;
      return {
        id: o.id,
        displayId: o.display_id,
        status: o.status,
        payment: o.payment_mode,
        amount: Number(o.final_amount ?? o.est_amount),
        createdAt: o.created_at,
        readyBy: o.ready_by,
        late: !!o.ready_by && ["ACCEPTED", "PACKING"].includes(o.status) && new Date(o.ready_by).getTime() < now,
        noShop: !o.dealer_id && ["PLACED", "DEALER_ASSIGNED"].includes(o.status),
        customer: c?.full_name ?? null,
        customerPhone: c?.phone ?? null,
        pincode: (o.addresses as unknown as { pincode: string } | null)?.pincode ?? null,
        shop: (o.dealers as unknown as { shop_name: string } | null)?.shop_name ?? null,
        rider: (o.delivery_partners as unknown as { profiles: Name } | null)?.profiles?.full_name ?? null,
      };
    });
  }

  async orderDetail(id: string) {
    const db = this.db;
    const { data: o, error } = await db
      .from("orders")
      .select(
        "id, display_id, status, payment_mode, payment_status, est_amount, final_amount, cancel_reason, created_at, ready_by, dealer_id, rider_id, profiles!orders_customer_id_fkey(full_name, phone), addresses(address_text, landmark, pincode, lat, lng), dealers(id, shop_name, profiles(full_name, phone)), delivery_partners(id, vehicle, profiles(full_name, phone)), order_items(id, requested_kg, cut, size, unavailable, unit_price_per_kg, products(name, unit))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!o) throw new NotFoundException("Order not found");

    const [{ data: history }, { data: offers }, { data: proofs }, { data: attempts }] = await Promise.all([
      db.from("order_status_history").select("to_status, note, created_at, profiles(full_name)").eq("order_id", id).order("created_at"),
      db.from("order_assignments").select("offered_at, responded_at, outcome, reason, dealers(shop_name)").eq("order_id", id).order("offered_at"),
      db.from("order_proofs").select("type, photo_path, order_item_id, created_at").eq("order_id", id).order("created_at"),
      db.from("delivery_attempts").select("reason, photo_path, created_at").eq("order_id", id).order("created_at"),
    ]);

    const sign = async (path: string | null) => {
      if (!path) return null;
      const { data } = await db.storage.from("order-proofs").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    };
    const shop = o.dealers as unknown as { id: string; shop_name: string; profiles: Name } | null;
    const rider = o.delivery_partners as unknown as { id: string; vehicle: string | null; profiles: Name } | null;
    const cust = o.profiles as unknown as Name;
    return {
      id: o.id,
      displayId: o.display_id,
      status: o.status,
      payment: o.payment_mode,
      paymentStatus: o.payment_status,
      amount: Number(o.final_amount ?? o.est_amount),
      cancelReason: o.cancel_reason,
      createdAt: o.created_at,
      readyBy: o.ready_by,
      customer: { name: cust?.full_name ?? null, phone: cust?.phone ?? null },
      address: o.addresses,
      shop: shop ? { id: shop.id, name: shop.shop_name, owner: shop.profiles?.full_name ?? null, phone: shop.profiles?.phone ?? null } : null,
      rider: rider ? { id: rider.id, name: rider.profiles?.full_name ?? null, phone: rider.profiles?.phone ?? null, vehicle: rider.vehicle } : null,
      items: (o.order_items as unknown as { id: string; requested_kg: number; cut: string; size: string | null; unavailable: boolean; unit_price_per_kg: number; products: { name: string; unit: string } | null }[]).map((i) => ({
        id: i.id,
        name: i.products?.name ?? "Item",
        unit: i.products?.unit ?? "kg",
        qty: Number(i.requested_kg),
        cut: i.cut,
        size: i.size,
        unavailable: i.unavailable,
        price: Number(i.unit_price_per_kg),
      })),
      timeline: (history ?? []).map((h) => ({ status: h.to_status, note: h.note, at: h.created_at, by: (h.profiles as unknown as Name)?.full_name ?? null })),
      offers: (offers ?? []).map((a) => ({ shop: (a.dealers as unknown as { shop_name: string } | null)?.shop_name ?? "", offeredAt: a.offered_at, respondedAt: a.responded_at, outcome: a.outcome, reason: a.reason })),
      photos: await Promise.all(
        [...(proofs ?? []).map((p) => ({ kind: p.type as string, path: p.photo_path, at: p.created_at })), ...(attempts ?? []).map((a) => ({ kind: `failed: ${a.reason}`, path: a.photo_path, at: a.created_at }))].map(async (p) => ({ kind: p.kind, at: p.at, url: await sign(p.path) })),
      ),
      can: {
        cancel: ["PLACED", "DEALER_ASSIGNED", "ACCEPTED", "PACKING", "PACKED"].includes(o.status),
        reassignShop: ["PLACED", "DEALER_ASSIGNED"].includes(o.status),
        releaseRider: o.status === "RIDER_ASSIGNED",
      },
    };
  }

  async cancelOrder(admin: AdminUser, id: string, reason: string) {
    const db = this.db;
    const { data: o } = await db.from("orders").select("status, rider_id").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Order not found");
    await this.orders.transition({ orderId: id, to: "CANCELLED", actorId: admin.id, note: `Cancelled by admin: ${reason}` });
    await db.from("orders").update({ cancel_reason: reason }).eq("id", id);
    await db.from("order_assignments").update({ outcome: "cancelled", responded_at: new Date().toISOString() }).eq("order_id", id).eq("outcome", "pending");
    await this.audit.log(admin.id, "order.cancel", id, { reason, from: o.status });
    return { cancelled: true };
  }

  /** Move an unaccepted order to another shop: a chosen one, or the next best. */
  async reassignShop(admin: AdminUser, id: string, dealerId?: string) {
    const db = this.db;
    const { data: o } = await db.from("orders").select("status, dealer_id").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Order not found");
    if (!["PLACED", "DEALER_ASSIGNED"].includes(o.status)) throw new BadRequestException("The shop has already accepted this order");
    const now = new Date().toISOString();
    await db.from("order_assignments").update({ outcome: "cancelled", responded_at: now, reason: "reassigned by admin" }).eq("order_id", id).eq("outcome", "pending");

    let result: { assigned: boolean; dealerId?: string };
    if (dealerId) {
      const { data: shop } = await db.from("dealers").select("id, profile_id, is_active").eq("id", dealerId).maybeSingle();
      if (!shop?.is_active) throw new BadRequestException("That shop is not active");
      const deadline = new Date(Date.now() + 5 * 60_000).toISOString();
      const { error } = await db.from("order_assignments").insert({ order_id: id, dealer_id: dealerId, deadline_at: deadline });
      if (error) throw new BadRequestException(error.message);
      await db.from("orders").update({ dealer_id: dealerId }).eq("id", id);
      if (o.status === "PLACED") await this.orders.transition({ orderId: id, to: "DEALER_ASSIGNED", actorId: admin.id, note: "assigned by admin" });
      result = { assigned: true, dealerId };
    } else {
      result = await this.assignment.offer(id);
    }
    await this.audit.log(admin.id, "order.reassign_shop", id, { from: o.dealer_id, to: result.dealerId ?? null });
    if (!result.assigned) throw new BadRequestException("No other open shop stocks these items for this pincode");
    return result;
  }

  /** Take the order off a rider who has not picked it up; it goes back on offer. */
  async releaseRider(admin: AdminUser, id: string) {
    const db = this.db;
    const { data: o } = await db.from("orders").select("status, rider_id").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Order not found");
    if (o.status !== "RIDER_ASSIGNED") throw new BadRequestException("Only an order waiting for pickup can be released");
    await this.orders.transition({ orderId: id, to: "PACKED", actorId: admin.id, note: "Rider released by admin" });
    await db.from("orders").update({ rider_id: null }).eq("id", id);
    await this.audit.log(admin.id, "order.release_rider", id, { rider: o.rider_id });
    return { released: true };
  }

  // ───────────────────────────── catalogue & area ─────────────────────────────

  async catalog() {
    const db = this.db;
    const [{ data: products }, { data: pins }] = await Promise.all([
      db
        .from("products")
        .select("id, name, name_ta, unit, base_price_per_kg, is_active, category_id, subcategory_id, categories(name, sort), subcategories(name)")
        .eq("is_active", true),
      db.from("zone_pincodes").select("pincode, area, lat, lng, zones(name, is_active)"),
    ]);
    return {
      products: (products ?? [])
        .map((p) => {
          const c = p.categories as unknown as { name: string; sort: number } | null;
          return {
            id: p.id,
            name: p.name,
            nameTa: p.name_ta,
            unit: p.unit,
            sellingPrice: Number(p.base_price_per_kg),
            category: c?.name ?? "Other",
            sort: c?.sort ?? 99,
            sub: (p.subcategories as unknown as { name: string } | null)?.name ?? null,
            categoryId: p.category_id as string,
            subcategoryId: (p.subcategory_id as string | null) ?? null,
          };
        })
        .sort((a, b) => a.sort - b.sort || (a.sub ?? "").localeCompare(b.sub ?? "") || a.name.localeCompare(b.name)),
      categories: [...new Map((products ?? []).map((p) => [p.category_id, { id: p.category_id as string, name: (p.categories as unknown as { name: string } | null)?.name ?? "Other" }])).values()],
      subcategories: [...new Map((products ?? []).filter((p) => p.subcategory_id).map((p) => [p.subcategory_id, { id: p.subcategory_id as string, categoryId: p.category_id as string, name: (p.subcategories as unknown as { name: string } | null)?.name ?? "" }])).values()],
      pincodes: (pins ?? [])
        .filter((z) => (z.zones as unknown as { is_active: boolean } | null)?.is_active !== false)
        .map((z) => ({ pincode: z.pincode, area: z.area, lat: z.lat, lng: z.lng, zone: (z.zones as unknown as { name: string } | null)?.name ?? null })),
    };
  }

  // ───────────────────────────── partners (shared) ─────────────────────────────

  /**
   * The login for a shop or rider is their phone number (OTP in the partner
   * app). Find that person, or create the auth user, and give them the role.
   * A number already used by a different partner role is refused.
   */
  private async partnerProfile(phone10: string, role: "dealer" | "rider", name: string, keepId?: string) {
    const db = this.db;
    const phone = `91${phone10}`;
    let { data: profile } = await db.from("profiles").select("id, role").eq("phone", phone).maybeSingle();
    if (profile && keepId && profile.id !== keepId) throw new ConflictException("This number already belongs to another account");
    if (profile && profile.role !== role && ["dealer", "rider", "admin"].includes(profile.role)) {
      throw new ConflictException(`This number is already a ${profile.role === "dealer" ? "shop" : profile.role} login`);
    }
    if (!profile) {
      const { data: created, error } = await db.auth.admin.createUser({ phone: `+${phone}`, phone_confirm: true });
      if (error) throw new BadRequestException(error.message);
      for (let i = 0; i < 10 && !profile; i++) {
        await new Promise((r) => setTimeout(r, 300));
        ({ data: profile } = await db.from("profiles").select("id, role").eq("id", created.user.id).maybeSingle());
      }
      if (!profile) {
        const ins = await db.from("profiles").insert({ id: created.user.id, phone, role }).select("id, role").single();
        if (ins.error) throw new BadRequestException(ins.error.message);
        profile = ins.data;
      }
    }
    const { error } = await db.from("profiles").update({ role, full_name: name }).eq("id", profile.id);
    if (error) throw new BadRequestException(error.message);
    return profile.id as string;
  }

  /** Change a partner's login number on their existing account. */
  private async changePhone(profileId: string, phone10: string) {
    const db = this.db;
    const phone = `91${phone10}`;
    const { data: cur } = await db.from("profiles").select("phone").eq("id", profileId).single();
    if (cur?.phone === phone) return;
    const { data: taken } = await db.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (taken) throw new ConflictException("This number already belongs to another account");
    const { error } = await db.auth.admin.updateUserById(profileId, { phone: `+${phone}`, phone_confirm: true });
    if (error) throw new BadRequestException(error.message);
    await db.from("profiles").update({ phone }).eq("id", profileId);
  }

  // ───────────────────────────── shops ─────────────────────────────

  async listShops() {
    const db = this.db;
    const IST = 5.5 * 3600_000;
    const today0 = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST).toISOString();
    const [{ data: shops }, { data: today }] = await Promise.all([
      db
        .from("dealers")
        .select("id, shop_name, is_open, is_active, closed_until, open_windows, weekly_off, lat, lng, created_at, profiles(full_name, phone), dealer_pincodes(pincode), dealer_products(product_id)")
        .order("created_at"),
      db.from("orders").select("dealer_id, status, final_amount, est_amount").gte("created_at", today0).not("dealer_id", "is", null),
    ]);
    const now = Date.now();
    return (shops ?? []).map((s) => {
      const mine = (today ?? []).filter((o) => o.dealer_id === s.id);
      const p = s.profiles as unknown as Name;
      return {
        id: s.id,
        name: s.shop_name,
        owner: p?.full_name ?? null,
        phone: p?.phone ?? null,
        isActive: s.is_active,
        isOpen: s.is_open && (!s.closed_until || new Date(s.closed_until).getTime() <= now),
        closedUntil: s.closed_until,
        hours: s.open_windows as [string, string][],
        weeklyOff: s.weekly_off,
        hasPin: s.lat != null && s.lng != null,
        pincodes: (s.dealer_pincodes as { pincode: string }[]).map((x) => x.pincode),
        products: (s.dealer_products as unknown[]).length,
        todayOrders: mine.length,
        todaySales: mine.filter((o) => o.status === "DELIVERED").reduce((t, o) => t + Number(o.final_amount ?? o.est_amount), 0),
      };
    });
  }

  async shopDetail(id: string) {
    const { data: s } = await this.db
      .from("dealers")
      .select("id, shop_name, fssai_no, lat, lng, is_active, open_windows, weekly_off, profiles(full_name, phone), dealer_pincodes(pincode), dealer_products(product_id, price_per_kg)")
      .eq("id", id)
      .maybeSingle();
    if (!s) throw new NotFoundException("Shop not found");
    const p = s.profiles as unknown as Name;
    return {
      id: s.id,
      shopName: s.shop_name,
      ownerName: p?.full_name ?? "",
      phone: (p?.phone ?? "").replace(/^91/, ""),
      fssaiNo: s.fssai_no,
      lat: s.lat,
      lng: s.lng,
      isActive: s.is_active,
      openWindows: s.open_windows,
      weeklyOff: s.weekly_off,
      pincodes: (s.dealer_pincodes as { pincode: string }[]).map((x) => x.pincode),
      products: (s.dealer_products as { product_id: string; price_per_kg: number | null }[]).map((x) => ({ productId: x.product_id, pricePerKg: x.price_per_kg == null ? null : Number(x.price_per_kg) })),
    };
  }

  async saveShop(admin: AdminUser, input: AdminShopInput, id?: string) {
    const db = this.db;
    let dealerId = id;
    if (id) {
      const { data: cur } = await db.from("dealers").select("profile_id").eq("id", id).maybeSingle();
      if (!cur) throw new NotFoundException("Shop not found");
      await this.changePhone(cur.profile_id, input.phone);
      await db.from("profiles").update({ full_name: input.ownerName }).eq("id", cur.profile_id);
    } else {
      const profileId = await this.partnerProfile(input.phone, "dealer", input.ownerName);
      const { data: existing } = await db.from("dealers").select("id").eq("profile_id", profileId).maybeSingle();
      if (existing) throw new ConflictException("This number already has a shop");
      const ins = await db.from("dealers").insert({ profile_id: profileId, shop_name: input.shopName, lat: input.lat, lng: input.lng }).select("id").single();
      if (ins.error) throw new BadRequestException(ins.error.message);
      dealerId = ins.data.id;
    }

    const { error } = await db
      .from("dealers")
      .update({
        shop_name: input.shopName,
        fssai_no: input.fssaiNo || null,
        lat: input.lat,
        lng: input.lng,
        open_windows: input.openWindows,
        weekly_off: input.weeklyOff,
        ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
      })
      .eq("id", dealerId!);
    if (error) throw new BadRequestException(error.message);

    // Pincodes: replace the set.
    await db.from("dealer_pincodes").delete().eq("dealer_id", dealerId!);
    const pins = await db.from("dealer_pincodes").insert([...new Set(input.pincodes)].map((pincode) => ({ dealer_id: dealerId, pincode })));
    if (pins.error) throw new BadRequestException(pins.error.message);

    // Products: keep stock state for products that stay, drop removed ones.
    const keep = input.products.map((p) => p.productId);
    const del = db.from("dealer_products").delete().eq("dealer_id", dealerId!);
    await (keep.length ? del.not("product_id", "in", `(${keep.join(",")})`) : del);
    if (input.products.length) {
      const up = await db
        .from("dealer_products")
        .upsert(input.products.map((p) => ({ dealer_id: dealerId, product_id: p.productId, price_per_kg: p.pricePerKg })), { onConflict: "dealer_id,product_id" });
      if (up.error) throw new BadRequestException(up.error.message);
    }

    await this.audit.log(admin.id, id ? "shop.update" : "shop.enrol", dealerId, {
      shop: input.shopName,
      phone: input.phone,
      pincodes: input.pincodes,
      products: input.products.length,
      active: input.isActive,
    });
    return { id: dealerId };
  }

  /** How a shop has performed over the last 30 days, plus its recent orders. */
  async shopStats(id: string) {
    const db = this.db;
    const IST = 5.5 * 3600_000;
    const DAYS = 30;
    const today0 = Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST;
    const from = new Date(today0 - (DAYS - 1) * 86_400_000).toISOString();
    const [{ data: shop }, { data: orders }, { data: offers }, { data: prices }] = await Promise.all([
      db.from("dealers").select("id, shop_name, is_open, is_active, closed_until, created_at, profiles(full_name, phone), dealer_pincodes(pincode)").eq("id", id).maybeSingle(),
      db
        .from("orders")
        .select("id, display_id, status, est_amount, final_amount, created_at, ready_by, profiles!orders_customer_id_fkey(full_name), order_items(product_id, requested_kg, unavailable, products(name, unit)), order_status_history(to_status, created_at)")
        .eq("dealer_id", id)
        .gte("created_at", from)
        .order("created_at", { ascending: false }),
      db.from("order_assignments").select("offered_at, responded_at, outcome").eq("dealer_id", id).gte("offered_at", from),
      db.from("dealer_products").select("product_id, price_per_kg").eq("dealer_id", id),
    ]);
    if (!shop) throw new NotFoundException("Shop not found");
    const cost = new Map((prices ?? []).map((p) => [p.product_id, Number(p.price_per_kg ?? 0)]));

    const days = Array.from({ length: DAYS }, (_, i) => ({ date: new Date(today0 - (DAYS - 1 - i) * 86_400_000 + IST).toISOString().slice(0, 10), orders: 0, sales: 0 }));
    let delivered = 0, cancelled = 0, failed = 0, sales = 0, spend = 0;
    const prep: number[] = [];
    let onTime = 0, timed = 0;
    const products = new Map<string, { name: string; unit: string; qty: number; orders: number }>();
    type H = { to_status: string; created_at: string };
    type It = { product_id: string; requested_kg: number; unavailable: boolean; products: { name: string; unit: string } | null };

    for (const o of orders ?? []) {
      const idx = Math.floor((new Date(o.created_at).getTime() - (today0 - (DAYS - 1) * 86_400_000)) / 86_400_000);
      const amount = Number(o.final_amount ?? o.est_amount);
      if (days[idx]) days[idx].orders += 1;
      if (o.status === "DELIVERED") {
        delivered += 1;
        sales += amount;
        if (days[idx]) days[idx].sales += amount;
        for (const it of o.order_items as unknown as It[]) {
          if (it.unavailable) continue;
          spend += (cost.get(it.product_id) ?? 0) * Number(it.requested_kg);
        }
      }
      if (o.status === "CANCELLED" || o.status === "REFUNDED") cancelled += 1;
      if (o.status === "DELIVERY_FAILED" || o.status === "RETURNED") failed += 1;
      for (const it of o.order_items as unknown as It[]) {
        if (it.unavailable || !it.products) continue;
        const cur = products.get(it.product_id) ?? { name: it.products.name, unit: it.products.unit, qty: 0, orders: 0 };
        cur.qty += Number(it.requested_kg);
        cur.orders += 1;
        products.set(it.product_id, cur);
      }
      const h = o.order_status_history as unknown as H[];
      const acc = h.find((x) => x.to_status === "ACCEPTED");
      const packed = h.find((x) => x.to_status === "PACKED");
      if (acc && packed) {
        prep.push((new Date(packed.created_at).getTime() - new Date(acc.created_at).getTime()) / 60000);
        if (o.ready_by) {
          timed += 1;
          if (new Date(packed.created_at).getTime() <= new Date(o.ready_by).getTime() + 60_000) onTime += 1;
        }
      }
    }
    const offered = offers?.length ?? 0;
    const accepted = (offers ?? []).filter((a) => a.outcome === "accepted");
    const responseSecs = accepted.filter((a) => a.responded_at).map((a) => (new Date(a.responded_at!).getTime() - new Date(a.offered_at).getTime()) / 1000);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const p = shop.profiles as unknown as Name;
    const now = Date.now();
    return {
      id: shop.id,
      name: shop.shop_name,
      owner: p?.full_name ?? null,
      phone: p?.phone ?? null,
      isActive: shop.is_active,
      isOpen: shop.is_open && (!shop.closed_until || new Date(shop.closed_until).getTime() <= now),
      since: shop.created_at,
      pincodes: (shop.dealer_pincodes as { pincode: string }[]).map((x) => x.pincode),
      totals: {
        orders: orders?.length ?? 0,
        delivered,
        cancelled,
        failed,
        sales: Math.round(sales),
        paidToShop: Math.round(spend),
        margin: Math.round(sales - spend),
      },
      offers: {
        offered,
        accepted: accepted.length,
        declined: (offers ?? []).filter((a) => a.outcome === "rejected").length,
        missed: (offers ?? []).filter((a) => a.outcome === "timeout").length,
        acceptRate: offered ? Math.round((accepted.length / offered) * 100) : null,
        avgAcceptSecs: avg(responseSecs) == null ? null : Math.round(avg(responseSecs)!),
      },
      prep: {
        // Median, so one order left sitting overnight doesn't skew it.
        avgMinutes: prep.length ? Math.round([...prep].sort((a, b) => a - b)[Math.floor(prep.length / 2)]) : null,
        fastest: prep.length ? Math.round(Math.min(...prep)) : null,
        slowest: prep.length ? Math.round(Math.max(...prep)) : null,
        onTimePct: timed ? Math.round((onTime / timed) * 100) : null,
        counted: prep.length,
      },
      days,
      topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5).map((x) => ({ ...x, qty: Math.round(x.qty * 10) / 10 })),
      recent: (orders ?? []).slice(0, 15).map((o) => ({
        id: o.id,
        displayId: o.display_id,
        status: o.status,
        amount: Number(o.final_amount ?? o.est_amount),
        createdAt: o.created_at,
        customer: (o.profiles as unknown as Name)?.full_name ?? null,
        items: (o.order_items as unknown as It[]).filter((i) => !i.unavailable).length,
      })),
    };
  }

  // ───────────────────────────── riders ─────────────────────────────

  async listRiders() {
    const db = this.db;
    const IST = 5.5 * 3600_000;
    const today0 = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST).toISOString();
    const [{ data: riders }, { data: locs }, { data: trips }, { data: active }] = await Promise.all([
      db.from("delivery_partners").select("id, vehicle, is_online, is_active, cash_balance, created_at, profiles(full_name, phone)").order("created_at"),
      db.from("rider_locations").select("rider_id, lat, lng, updated_at"),
      db.from("trips").select("rider_id, total_km, trip_stops(delivered_at, failed_at)").gte("started_at", today0),
      db.from("orders").select("rider_id").in("status", ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"]).not("rider_id", "is", null),
    ]);
    return (riders ?? []).map((r) => {
      const p = r.profiles as unknown as Name;
      const mine = (trips ?? []).filter((t) => t.rider_id === r.id);
      const stops = mine.flatMap((t) => t.trip_stops as { delivered_at: string | null; failed_at: string | null }[]);
      const loc = (locs ?? []).find((l) => l.rider_id === r.id);
      return {
        id: r.id,
        name: p?.full_name ?? null,
        phone: p?.phone ?? null,
        vehicle: r.vehicle,
        isOnline: r.is_online,
        isActive: r.is_active,
        cash: Number(r.cash_balance),
        carrying: (active ?? []).filter((o) => o.rider_id === r.id).length,
        today: {
          trips: mine.length,
          delivered: stops.filter((s) => s.delivered_at).length,
          failed: stops.filter((s) => s.failed_at).length,
          km: Math.round(mine.reduce((t, x) => t + Number(x.total_km ?? 0), 0) * 10) / 10,
        },
        lastSeen: loc?.updated_at ?? null,
        location: loc ? { lat: loc.lat, lng: loc.lng } : null,
      };
    });
  }

  async saveRider(admin: AdminUser, input: AdminRiderInput, id?: string) {
    const db = this.db;
    let riderId = id;
    if (id) {
      const { data: cur } = await db.from("delivery_partners").select("profile_id").eq("id", id).maybeSingle();
      if (!cur) throw new NotFoundException("Rider not found");
      await this.changePhone(cur.profile_id, input.phone);
      await db.from("profiles").update({ full_name: input.name }).eq("id", cur.profile_id);
    } else {
      const profileId = await this.partnerProfile(input.phone, "rider", input.name);
      const { data: existing } = await db.from("delivery_partners").select("id").eq("profile_id", profileId).maybeSingle();
      if (existing) throw new ConflictException("This number is already a rider");
      const ins = await db.from("delivery_partners").insert({ profile_id: profileId }).select("id").single();
      if (ins.error) throw new BadRequestException(ins.error.message);
      riderId = ins.data.id;
    }
    const patch: Record<string, unknown> = { vehicle: input.vehicle || null };
    if (input.isActive !== undefined) {
      patch.is_active = input.isActive;
      if (!input.isActive) patch.is_online = false;
    }
    const { error } = await db.from("delivery_partners").update(patch).eq("id", riderId!);
    if (error) throw new BadRequestException(error.message);
    await this.audit.log(admin.id, id ? "rider.update" : "rider.enrol", riderId, { name: input.name, phone: input.phone, vehicle: input.vehicle, active: input.isActive });
    return { id: riderId };
  }

  /**
   * A rider's last 30 days: offers taken or turned down, how long deliveries
   * took (pickup → handover), failures and why, km, online hours and cash.
   */
  async riderStats(id: string) {
    const db = this.db;
    const IST = 5.5 * 3600_000;
    const DAYS = 30;
    const LATE_MIN = RIDER_LATE_MIN;
    const today0 = Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST;
    const start = today0 - (DAYS - 1) * 86_400_000;
    const from = new Date(start).toISOString();
    const [{ data: r }, { data: offers }, { data: trips }, { data: attempts }, { data: shifts }, { data: subs }] = await Promise.all([
      db.from("delivery_partners").select("id, vehicle, is_online, is_active, cash_balance, created_at, profiles(full_name, phone)").eq("id", id).maybeSingle(),
      db.from("rider_offers").select("order_id, outcome, created_at").eq("rider_id", id).gte("created_at", from),
      db
        .from("trips")
        .select("id, started_at, ended_at, total_km, dealers(shop_name), trip_stops(order_id, seq, actual_seq, reorder_reason, delivered_at, failed_at, returned_at, cash_collected, orders(display_id, final_amount, est_amount))")
        .eq("rider_id", id)
        .gte("started_at", from)
        .order("started_at", { ascending: false }),
      db.from("delivery_attempts").select("reason").eq("rider_id", id).gte("created_at", from),
      db.from("rider_shifts").select("started_at, ended_at").eq("rider_id", id).gte("started_at", from),
      db.from("cash_submissions").select("business_date, expected, submitted, mismatch_note, verified_by").eq("rider_id", id).gte("business_date", from.slice(0, 10)).order("business_date", { ascending: false }),
    ]);
    if (!r) throw new NotFoundException("Rider not found");

    // How long after the order was packed the rider grabbed it.
    const wonIds = (offers ?? []).filter((o) => o.outcome === "won").map((o) => o.order_id);
    const { data: packed } = wonIds.length
      ? await db.from("order_status_history").select("order_id, created_at").in("order_id", wonIds).eq("to_status", "PACKED")
      : { data: [] as { order_id: string; created_at: string }[] };
    const packedAt = new Map((packed ?? []).map((p) => [p.order_id, new Date(p.created_at).getTime()]));
    const grabSecs = (offers ?? [])
      .filter((o) => o.outcome === "won" && packedAt.has(o.order_id))
      .map((o) => (new Date(o.created_at).getTime() - packedAt.get(o.order_id)!) / 1000)
      .filter((x) => x >= 0);

    type S = { order_id: string; seq: number; actual_seq: number | null; reorder_reason: string | null; delivered_at: string | null; failed_at: string | null; returned_at: string | null; cash_collected: number; orders: { display_id: string; final_amount: number | null; est_amount: number } | null };
    const days = Array.from({ length: DAYS }, (_, i) => ({ date: new Date(start + i * 86_400_000 + IST).toISOString().slice(0, 10), delivered: 0, failed: 0, km: 0 }));
    const dayOf = (iso: string) => days[Math.floor((new Date(iso).getTime() - start) / 86_400_000)];
    const durations: number[] = [];
    let delivered = 0, failed = 0, returned = 0, reordered = 0, km = 0, cash = 0, late = 0;
    for (const t of trips ?? []) {
      km += Number(t.total_km ?? 0);
      const d0 = dayOf(t.started_at);
      if (d0) d0.km += Number(t.total_km ?? 0);
      for (const st of t.trip_stops as unknown as S[]) {
        if (st.reorder_reason) reordered += 1;
        if (st.returned_at) returned += 1;
        cash += Number(st.cash_collected ?? 0);
        if (st.delivered_at) {
          delivered += 1;
          const d = dayOf(st.delivered_at);
          if (d) d.delivered += 1;
          const mins = (new Date(st.delivered_at).getTime() - new Date(t.started_at).getTime()) / 60000;
          durations.push(mins);
          if (mins > LATE_MIN) late += 1;
        } else if (st.failed_at) {
          failed += 1;
          const d = dayOf(st.failed_at);
          if (d) d.failed += 1;
        }
      }
    }
    const reasons: Record<string, number> = {};
    for (const a of attempts ?? []) reasons[a.reason] = (reasons[a.reason] ?? 0) + 1;
    const now = Date.now();
    const onlineHours = (shifts ?? []).reduce((t, s) => t + ((s.ended_at ? new Date(s.ended_at).getTime() : now) - new Date(s.started_at).getTime()) / 3600_000, 0);
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const count = (o: string) => (offers ?? []).filter((x) => x.outcome === o).length;
    const taken = count("won");
    const declined = count("rejected");
    const lost = count("lost");
    const p = r.profiles as unknown as Name;

    return {
      id: r.id,
      name: p?.full_name ?? "Rider",
      since: r.created_at,
      lateAfterMin: LATE_MIN,
      offers: {
        responded: taken + declined + lost,
        accepted: taken,
        declined,
        lost,
        acceptRate: taken + declined ? Math.round((taken / (taken + declined)) * 100) : null,
        avgGrabSecs: grabSecs.length ? Math.round(grabSecs.reduce((a, b) => a + b, 0) / grabSecs.length) : null,
      },
      deliveries: {
        delivered,
        failed,
        returned,
        reordered,
        late,
        onTimePct: delivered ? Math.round(((delivered - late) / delivered) * 100) : null,
        successPct: delivered + failed ? Math.round((delivered / (delivered + failed)) * 100) : null,
        typicalMin: median == null ? null : Math.round(median),
        slowestMin: sorted.length ? Math.round(sorted[sorted.length - 1]) : null,
        failReasons: reasons,
      },
      work: {
        trips: trips?.length ?? 0,
        km: Math.round(km * 10) / 10,
        onlineHours: Math.round(onlineHours * 10) / 10,
        cashCollected: Math.round(cash),
        cashInHand: Number(r.cash_balance),
        handovers: (subs ?? []).length,
        mismatches: (subs ?? []).filter((x) => x.mismatch_note).length,
      },
      days: days.map((d) => ({ ...d, km: Math.round(d.km * 10) / 10 })),
      trips: (trips ?? []).slice(0, 12).map((t) => {
        const stops = t.trip_stops as unknown as S[];
        return {
          id: t.id,
          startedAt: t.started_at,
          endedAt: t.ended_at,
          km: t.total_km == null ? null : Number(t.total_km),
          shop: (t.dealers as unknown as { shop_name: string } | null)?.shop_name ?? null,
          stops: stops
            .sort((a, b) => (a.actual_seq ?? a.seq) - (b.actual_seq ?? b.seq))
            .map((s) => ({
              orderId: s.order_id,
              displayId: s.orders?.display_id ?? "",
              outcome: s.delivered_at ? "delivered" : s.returned_at ? "returned" : s.failed_at ? "failed" : "open",
              minutes: s.delivered_at ? Math.round((new Date(s.delivered_at).getTime() - new Date(t.started_at).getTime()) / 60000) : null,
              reordered: !!s.reorder_reason,
            })),
        };
      }),
    };
  }

  /** Where a rider is right now, where they've been today, and what they're carrying. */
  async riderLive(id: string) {
    const db = this.db;
    const IST = 5.5 * 3600_000;
    const today0 = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST).toISOString();
    const [{ data: r }, { data: loc }, { data: trail }, { data: orders }, { data: shift }] = await Promise.all([
      db.from("delivery_partners").select("id, vehicle, is_online, cash_balance, profiles(full_name, phone)").eq("id", id).maybeSingle(),
      db.from("rider_locations").select("lat, lng, heading, speed_kmh, updated_at").eq("rider_id", id).maybeSingle(),
      db.from("rider_location_points").select("lat, lng, recorded_at").eq("rider_id", id).gte("recorded_at", today0).order("recorded_at").limit(2000),
      db
        .from("orders")
        .select("id, display_id, status, est_amount, final_amount, pickup_lat, pickup_lng, profiles!orders_customer_id_fkey(full_name), addresses(address_text, pincode, lat, lng), dealers(shop_name, lat, lng)")
        .eq("rider_id", id)
        .in("status", ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"])
        .order("created_at"),
      db.from("rider_shifts").select("started_at").eq("rider_id", id).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!r) throw new NotFoundException("Rider not found");
    const p = r.profiles as unknown as Name;
    const km = (trail ?? []).reduce((t, x, i, a) => (i ? t + hav(a[i - 1], x) : 0), 0);
    return {
      id: r.id,
      name: p?.full_name ?? "Rider",
      phone: p?.phone ?? null,
      vehicle: r.vehicle,
      isOnline: r.is_online,
      cash: Number(r.cash_balance),
      onlineSince: shift?.started_at ?? null,
      position: loc ? { lat: loc.lat, lng: loc.lng, heading: loc.heading, speedKmh: loc.speed_kmh, at: loc.updated_at } : null,
      trail: (trail ?? []).map((x) => [x.lat, x.lng] as [number, number]),
      trailKm: Math.round(km * 10) / 10,
      stops: (orders ?? []).map((o) => {
        const a = o.addresses as unknown as { address_text: string; pincode: string; lat: number | null; lng: number | null } | null;
        const d = o.dealers as unknown as { shop_name: string; lat: number | null; lng: number | null } | null;
        return {
          id: o.id,
          displayId: o.display_id,
          status: o.status,
          amount: Number(o.final_amount ?? o.est_amount),
          customer: (o.profiles as unknown as Name)?.full_name ?? "Customer",
          address: a ? `${a.address_text} · ${a.pincode}` : null,
          at: a?.lat != null && a?.lng != null ? { lat: a.lat, lng: a.lng } : null,
          shop: d ? { name: d.shop_name, at: d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null } : null,
        };
      }),
    };
  }

  // ───────────────────────────── cash ─────────────────────────────

  async cash() {
    const db = this.db;
    const [{ data: riders }, { data: subs }] = await Promise.all([
      db.from("delivery_partners").select("id, cash_balance, is_online, profiles(full_name, phone)").eq("is_active", true).order("cash_balance", { ascending: false }),
      db
        .from("cash_submissions")
        .select("id, business_date, expected, submitted, mismatch_note, verified_by, created_at, delivery_partners(profiles(full_name))")
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    const list = (subs ?? []).map((s) => ({
      id: s.id,
      rider: (s.delivery_partners as unknown as { profiles: Name } | null)?.profiles?.full_name ?? "Rider",
      date: s.business_date,
      expected: Number(s.expected),
      submitted: s.submitted == null ? null : Number(s.submitted),
      note: s.mismatch_note,
      verified: !!s.verified_by,
      at: s.created_at,
    }));
    return {
      inHand: (riders ?? []).map((r) => ({
        id: r.id,
        name: (r.profiles as unknown as Name)?.full_name ?? "Rider",
        phone: (r.profiles as unknown as Name)?.phone ?? null,
        online: r.is_online,
        cash: Number(r.cash_balance),
      })),
      totalInHand: (riders ?? []).reduce((t, r) => t + Number(r.cash_balance), 0),
      toVerify: list.filter((s) => !s.verified),
      verified: list.filter((s) => s.verified),
    };
  }

  /** The admin counted the hand-over: record what actually arrived. */
  async verifyCash(admin: AdminUser, id: string, received: number, note?: string) {
    const db = this.db;
    const { data: s } = await db.from("cash_submissions").select("id, submitted, verified_by").eq("id", id).maybeSingle();
    if (!s) throw new NotFoundException("Hand-over not found");
    if (s.verified_by) throw new BadRequestException("Already verified");
    const submitted = Number(s.submitted ?? 0);
    const diff = received - submitted;
    const mismatch = diff === 0 ? null : `rider said ₹${submitted}, counted ₹${received}${note ? ` — ${note}` : ""}`;
    const { error } = await db.from("cash_submissions").update({ verified_by: admin.id, mismatch_note: mismatch ?? (note || null) }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    await this.audit.log(admin.id, "cash.verify", id, { submitted, received, note });
    return { verified: true, diff };
  }
}

function hav(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
