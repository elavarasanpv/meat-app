import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminHeadlineInput, AdminOfferInput } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";

export type OfferRow = {
  id: string;
  kind: "banner" | "coupon";
  code: string | null;
  title: string;
  title_ta: string | null;
  subtitle: string | null;
  image_path: string | null;
  tint: string | null;
  discount_type: "percent" | "flat";
  discount_value: number;
  max_discount: number | null;
  min_order: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  product_ids: string[] | null;
  pincodes: string[] | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  sort: number;
  shop_share_pct: number;
  first_order_only: boolean;
  per_customer_limit: number | null;
  total_limit: number | null;
};
type QuoteItem = { productId: string; qty: number; price: number };
export type Verdict =
  | { ok: true; discount: number; offer: OfferRow }
  | { ok: false; reason: "not_found" | "not_live" | "min_order" | "first_order_only" | "already_used" | "fully_used" | "not_in_scope" | "pincode"; minOrder?: number };

const OFFER_COLS =
  "id, kind, code, title, title_ta, subtitle, image_path, tint, discount_type, discount_value, max_discount, min_order, category_id, subcategory_id, product_ids, pincodes, starts_at, ends_at, is_active, sort, shop_share_pct, first_order_only, per_customer_limit, total_limit";

/**
 * The one place discounts are decided. Only the best single offer applies to
 * an order: automatic banner offers compete with the typed coupon, and the
 * larger saving wins. Discounts cover items only, never the delivery fee.
 */
@Injectable()
export class OffersService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.admin;
  }

  private async live(pincode?: string | null): Promise<OfferRow[]> {
    const now = new Date().toISOString();
    const { data } = await this.db.from("offers").select(OFFER_COLS).eq("is_active", true).lte("starts_at", now).gt("ends_at", now).order("sort").order("created_at");
    return ((data ?? []) as OfferRow[]).filter((o) => !pincode || !o.pincodes?.length || o.pincodes.includes(pincode));
  }

  /** product id → category/subcategory, for scope matching. */
  private async productScope(ids: string[]) {
    const { data } = await this.db.from("products").select("id, category_id, subcategory_id").in("id", ids);
    return new Map((data ?? []).map((p) => [p.id, p]));
  }

  private eligibleTotal(offer: OfferRow, items: QuoteItem[], scope: Map<string, { category_id: string; subcategory_id: string | null }>): number {
    return items.reduce((sum, it) => {
      const p = scope.get(it.productId);
      if (!p) return sum;
      if (offer.product_ids?.length) return offer.product_ids.includes(it.productId) ? sum + Math.round(it.price * it.qty) : sum;
      if (offer.subcategory_id) return p.subcategory_id === offer.subcategory_id ? sum + Math.round(it.price * it.qty) : sum;
      if (offer.category_id) return p.category_id === offer.category_id ? sum + Math.round(it.price * it.qty) : sum;
      return sum + Math.round(it.price * it.qty);
    }, 0);
  }

  /** Check one offer against a cart. Limits hit the database only when the maths already works. */
  private async check(offer: OfferRow, userId: string, items: QuoteItem[], scope: Map<string, { category_id: string; subcategory_id: string | null }>): Promise<Verdict> {
    const itemsTotal = items.reduce((s, i) => s + Math.round(i.price * i.qty), 0);
    if (offer.min_order && itemsTotal < Number(offer.min_order)) return { ok: false, reason: "min_order", minOrder: Number(offer.min_order) };
    const eligible = this.eligibleTotal(offer, items, scope);
    if (eligible <= 0) return { ok: false, reason: "not_in_scope" };
    let discount = offer.discount_type === "percent" ? Math.round((eligible * Number(offer.discount_value)) / 100) : Math.min(Math.round(Number(offer.discount_value)), eligible);
    if (offer.max_discount) discount = Math.min(discount, Math.round(Number(offer.max_discount)));
    if (discount <= 0) return { ok: false, reason: "not_in_scope" };

    const db = this.db;
    if (offer.first_order_only) {
      const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", userId).not("status", "in", '("CANCELLED","REFUNDED")');
      if ((count ?? 0) > 0) return { ok: false, reason: "first_order_only" };
    }
    const perCustomer = offer.per_customer_limit ?? (offer.kind === "coupon" ? 1 : null);
    if (perCustomer != null) {
      const { count } = await db
        .from("offer_redemptions")
        .select("id, orders!inner(status)", { count: "exact", head: true })
        .eq("offer_id", offer.id)
        .eq("customer_id", userId)
        .not("orders.status", "in", '("CANCELLED","REFUNDED")');
      if ((count ?? 0) >= perCustomer) return { ok: false, reason: "already_used" };
    }
    if (offer.total_limit != null) {
      const { count } = await db
        .from("offer_redemptions")
        .select("id, orders!inner(status)", { count: "exact", head: true })
        .eq("offer_id", offer.id)
        .not("orders.status", "in", '("CANCELLED","REFUNDED")');
      if ((count ?? 0) >= offer.total_limit) return { ok: false, reason: "fully_used" };
    }
    return { ok: true, discount, offer };
  }

  /**
   * Best single discount for this cart: every live banner offer competes, and
   * the typed coupon too. Returns what applied (or why the coupon didn't).
   */
  async quote(userId: string, items: QuoteItem[], couponCode?: string, pincode?: string) {
    const live = await this.live(pincode);
    const scope = await this.productScope(items.map((i) => i.productId));

    let best: { discount: number; offer: OfferRow } | null = null;
    for (const o of live.filter((x) => x.kind === "banner")) {
      const v = await this.check(o, userId, items, scope);
      if (v.ok && (!best || v.discount > best.discount)) best = v;
    }

    let coupon: Verdict | null = null;
    if (couponCode) {
      const c = live.find((x) => x.kind === "coupon" && x.code === couponCode);
      if (!c) {
        const { data: any } = await this.db.from("offers").select(OFFER_COLS).eq("code", couponCode).maybeSingle();
        coupon = { ok: false, reason: !any ? "not_found" : !(any as OfferRow).is_active ? "not_live" : (any as OfferRow).pincodes?.length && pincode && !(any as OfferRow).pincodes!.includes(pincode) ? "pincode" : "not_live" };
      } else {
        coupon = await this.check(c, userId, items, scope);
      }
    }

    const winner = coupon?.ok && (!best || coupon.discount >= best.discount) ? coupon : best ? { ...best, ok: true as const } : null;
    return {
      discount: winner?.discount ?? 0,
      offerId: winner?.offer.id ?? null,
      title: winner?.offer.title ?? null,
      code: winner?.offer.code ?? null,
      shopSharePct: winner ? Number(winner.offer.shop_share_pct) : 0,
      /** Set when a typed coupon was valid but an automatic offer saved more. */
      couponBeaten: !!(coupon?.ok && best && best.discount > coupon.discount),
      couponRejected: coupon && !coupon.ok ? { reason: coupon.reason, minOrder: coupon.minOrder } : null,
    };
  }

  /** Stamp the winning discount on a freshly placed order and log the redemption. */
  async applyToOrder(userId: string, orderId: string, couponCode?: string) {
    const db = this.db;
    const { data: order } = await db.from("orders").select("id, est_amount, addresses(pincode), order_items(product_id, requested_kg, unit_price_per_kg)").eq("id", orderId).single();
    if (!order) return;
    const items = (order.order_items as { product_id: string; requested_kg: number; unit_price_per_kg: number }[]).map((i) => ({
      productId: i.product_id,
      qty: Number(i.requested_kg),
      price: Number(i.unit_price_per_kg),
    }));
    const pincode = (order.addresses as unknown as { pincode: string } | null)?.pincode;
    const q = await this.quote(userId, items, couponCode, pincode);
    if (!q.discount || !q.offerId) return;

    const shopShare = Math.round((q.discount * q.shopSharePct) / 100);
    await db
      .from("orders")
      .update({ offer_id: q.offerId, coupon_code: q.code, discount_amount: q.discount, discount_shop_share: shopShare, est_amount: Number(order.est_amount) - q.discount })
      .eq("id", orderId);
    await db.from("offer_redemptions").insert({ offer_id: q.offerId, order_id: orderId, customer_id: userId, code: q.code, discount: q.discount, shop_share: shopShare });
  }

  /**
   * The discount an order keeps at packing: never more than first promised,
   * and never more than the remaining items can carry (an item may have been
   * unavailable). Returns the rupees to subtract from the final amount.
   */
  async discountAtPacking(orderId: string, remainingItemsTotal: number): Promise<number> {
    const { data: o } = await this.db.from("orders").select("discount_amount, discount_shop_share, offer_id").eq("id", orderId).maybeSingle();
    const promised = Math.round(Number(o?.discount_amount ?? 0));
    if (!promised) return 0;
    const kept = Math.min(promised, Math.max(0, remainingItemsTotal));
    if (kept < promised && o) {
      const shopShare = Math.round(Number(o.discount_shop_share ?? 0) * (kept / promised));
      await this.db.from("orders").update({ discount_amount: kept, discount_shop_share: shopShare }).eq("id", orderId);
      await this.db.from("offer_redemptions").update({ discount: kept, shop_share: shopShare }).eq("order_id", orderId);
    }
    return kept;
  }

  /**
   * Live offers for the home screen and cart: banners first, each with the
   * products it covers. Coupons this customer can no longer use (already
   * used up, first-order-only after their first order, or fully used) are
   * left out, so they never see a code that would only be refused.
   */
  async publicList(userId: string, pincode?: string) {
    const live = await this.live(pincode);
    const usable = await this.stillUsable(userId, live.filter((o) => o.kind === "coupon"));
    const out = [];
    for (const o of live) {
      if (o.kind === "coupon" && !usable.has(o.id)) continue;
      let products: string[] = o.product_ids ?? [];
      if (!products.length && (o.category_id || o.subcategory_id)) {
        let q = this.db.from("products").select("id").eq("is_active", true);
        if (o.subcategory_id) q = q.eq("subcategory_id", o.subcategory_id);
        else if (o.category_id) q = q.eq("category_id", o.category_id);
        products = ((await q).data ?? []).map((p) => p.id);
      }
      out.push({
        id: o.id,
        kind: o.kind,
        code: o.code,
        title: o.title,
        titleTa: o.title_ta,
        subtitle: o.subtitle,
        imageUrl: o.image_path ? this.db.storage.from("product-images").getPublicUrl(o.image_path).data.publicUrl : null,
        tint: o.tint,
        discountType: o.discount_type,
        discountValue: Number(o.discount_value),
        maxDiscount: o.max_discount == null ? null : Number(o.max_discount),
        minOrder: o.min_order == null ? null : Number(o.min_order),
        endsAt: o.ends_at,
        products, // [] = everything
      });
    }
    return out;
  }

  /** Which of these coupons this customer could still redeem (limits only; cart maths comes later). */
  private async stillUsable(userId: string, coupons: OfferRow[]): Promise<Set<string>> {
    const ok = new Set(coupons.map((c) => c.id));
    if (!coupons.length) return ok;
    const db = this.db;
    const needOrders = coupons.some((c) => c.first_order_only);
    const [{ count: orders }, { data: reds }] = await Promise.all([
      needOrders ? db.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", userId).not("status", "in", '("CANCELLED","REFUNDED")') : Promise.resolve({ count: 0 }),
      db.from("offer_redemptions").select("offer_id, customer_id, orders!inner(status)").in("offer_id", coupons.map((c) => c.id)).not("orders.status", "in", '("CANCELLED","REFUNDED")'),
    ]);
    for (const c of coupons) {
      if (c.first_order_only && (orders ?? 0) > 0) ok.delete(c.id);
      const mine = (reds ?? []).filter((r) => r.offer_id === c.id && r.customer_id === userId).length;
      const all = (reds ?? []).filter((r) => r.offer_id === c.id).length;
      const perCustomer = c.per_customer_limit ?? 1;
      if (mine >= perCustomer) ok.delete(c.id);
      if (c.total_limit != null && all >= c.total_limit) ok.delete(c.id);
    }
    return ok;
  }

  // ───────────────────────── home headline ─────────────────────────

  /** The admin's headline for right now (newest live one), or null to let the app rotate its own. */
  async liveHeadline() {
    const now = new Date().toISOString();
    const { data } = await this.db
      .from("home_headlines")
      .select("id, title, title_ta, subtitle, subtitle_ta, ends_at")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { id: data.id, title: data.title, titleTa: data.title_ta, subtitle: data.subtitle, subtitleTa: data.subtitle_ta, endsAt: data.ends_at } : null;
  }

  async adminHeadlines() {
    const { data } = await this.db.from("home_headlines").select("*").order("created_at", { ascending: false }).limit(50);
    const now = Date.now();
    return (data ?? []).map((h) => ({
      id: h.id,
      title: h.title,
      titleTa: h.title_ta,
      subtitle: h.subtitle,
      subtitleTa: h.subtitle_ta,
      startsAt: h.starts_at,
      endsAt: h.ends_at,
      isActive: h.is_active,
      status: !h.is_active ? "paused" : now < new Date(h.starts_at).getTime() ? "scheduled" : now >= new Date(h.ends_at).getTime() ? "ended" : "live",
    }));
  }

  async saveHeadline(adminId: string, input: AdminHeadlineInput, id?: string) {
    const row = {
      title: input.title,
      title_ta: input.titleTa || null,
      subtitle: input.subtitle || null,
      subtitle_ta: input.subtitleTa || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_active: input.isActive ?? true,
    };
    if (id) {
      const { error } = await this.db.from("home_headlines").update(row).eq("id", id);
      if (error) throw new BadRequestException(error.message);
      return { id };
    }
    const { data, error } = await this.db.from("home_headlines").insert({ ...row, created_by: adminId }).select("id").single();
    if (error) throw new BadRequestException(error.message);
    return { id: data.id };
  }

  async setHeadlineActive(id: string, active: boolean) {
    const { error } = await this.db.from("home_headlines").update({ is_active: active }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    return { id, isActive: active };
  }

  // ───────────────────────── admin ─────────────────────────

  async adminList() {
    const [{ data: offers }, { data: reds }] = await Promise.all([
      this.db.from("offers").select(OFFER_COLS + ", created_at").order("created_at", { ascending: false }),
      this.db.from("offer_redemptions").select("offer_id, discount, shop_share, orders!inner(status)").not("orders.status", "in", '("CANCELLED","REFUNDED")'),
    ]);
    const byOffer = new Map<string, { n: number; discount: number; shopShare: number }>();
    for (const r of reds ?? []) {
      const e = byOffer.get(r.offer_id) ?? { n: 0, discount: 0, shopShare: 0 };
      e.n += 1;
      e.discount += Number(r.discount);
      e.shopShare += Number(r.shop_share);
      byOffer.set(r.offer_id, e);
    }
    const now = Date.now();
    return ((offers ?? []) as unknown as (OfferRow & { created_at: string })[]).map((o) => ({
      ...this.toAdmin(o),
      stats: byOffer.get(o.id) ?? { n: 0, discount: 0, shopShare: 0 },
      status: !o.is_active ? "paused" : now < new Date(o.starts_at).getTime() ? "scheduled" : now >= new Date(o.ends_at).getTime() ? "ended" : "live",
    }));
  }

  private toAdmin(o: OfferRow) {
    return {
      id: o.id,
      kind: o.kind,
      code: o.code,
      title: o.title,
      titleTa: o.title_ta,
      subtitle: o.subtitle,
      imageUrl: o.image_path ? this.db.storage.from("product-images").getPublicUrl(o.image_path).data.publicUrl : null,
      tint: o.tint,
      discountType: o.discount_type,
      discountValue: Number(o.discount_value),
      maxDiscount: o.max_discount == null ? null : Number(o.max_discount),
      minOrder: o.min_order == null ? null : Number(o.min_order),
      categoryId: o.category_id,
      subcategoryId: o.subcategory_id,
      productIds: o.product_ids,
      pincodes: o.pincodes,
      startsAt: o.starts_at,
      endsAt: o.ends_at,
      isActive: o.is_active,
      sort: o.sort,
      shopSharePct: Number(o.shop_share_pct),
      firstOrderOnly: o.first_order_only,
      perCustomerLimit: o.per_customer_limit,
      totalLimit: o.total_limit,
    };
  }

  async save(adminId: string, input: AdminOfferInput, id?: string) {
    const db = this.db;
    if (input.code) {
      const { data: clash } = await db.from("offers").select("id").eq("code", input.code).maybeSingle();
      if (clash && clash.id !== id) throw new BadRequestException(`Code ${input.code} is already used`);
    }
    const row = {
      kind: input.kind,
      code: input.kind === "coupon" ? input.code : null,
      title: input.title,
      title_ta: input.titleTa || null,
      subtitle: input.subtitle || null,
      tint: input.tint || null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      max_discount: input.maxDiscount ?? null,
      min_order: input.minOrder ?? null,
      category_id: input.categoryId ?? null,
      subcategory_id: input.subcategoryId ?? null,
      product_ids: input.productIds?.length ? input.productIds : null,
      pincodes: input.pincodes?.length ? input.pincodes : null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_active: input.isActive ?? true,
      sort: input.sort ?? 0,
      shop_share_pct: input.shopSharePct,
      first_order_only: input.firstOrderOnly ?? false,
      per_customer_limit: input.perCustomerLimit ?? null,
      total_limit: input.totalLimit ?? null,
    };
    let offerId = id;
    if (id) {
      const { error } = await db.from("offers").update(row).eq("id", id);
      if (error) throw new BadRequestException(error.message);
    } else {
      const { data, error } = await db.from("offers").insert({ ...row, created_by: adminId }).select("id").single();
      if (error) throw new BadRequestException(error.message);
      offerId = data.id;
    }
    if (input.imageBase64) {
      const body = Buffer.from(input.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      if (body.byteLength > 1_200_000) throw new BadRequestException("Image too large");
      const path = `offers/${offerId}-${Date.now()}.jpg`;
      const { error } = await db.storage.from("product-images").upload(path, body, { contentType: "image/jpeg", upsert: true });
      if (error) throw new BadRequestException(error.message);
      await db.from("offers").update({ image_path: path }).eq("id", offerId!);
    }
    return { id: offerId };
  }

  async setActive(id: string, active: boolean) {
    const { error, count } = await this.db.from("offers").update({ is_active: active }, { count: "exact" }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException("Offer not found");
    return { id, isActive: active };
  }
}
