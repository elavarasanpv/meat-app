import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { bogoFreeUnits, couponSaving, shopOfferPush, type ShopOfferInput, type ShopOfferKind } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";
import { ImagesService } from "../images/images.service";

type Product = { name: string; name_ta: string | null; image_path: string | null; pack_size: string | null; mrp: number | null } | null;
type OfferRow = {
  id: string;
  dealer_id: string;
  kind: ShopOfferKind;
  master_product_id: string | null;
  scope: "product" | "products" | "category";
  product_ids: string[] | null;
  category_id: string | null;
  catalog_categories?: { name: string; name_ta: string | null } | null;
  /** Category offers, once loaded for a basket: every product in the category. */
  inCategory?: Set<string>;
  pct: number | null;
  buy_qty: number | null;
  free_qty: number | null;
  mix: boolean | null;
  /** Any-mix offers: the product given free. */
  free_product_id: string | null;
  free_product?: { name: string; name_ta: string | null; image_path: string | null } | null;
  color: string | null;
  min_order: number | null;
  max_discount: number | null;
  valid_days: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  reviewed_at: string | null;
  pushed_at: string | null;
  created_at: string;
  banner_path: string | null;
  /** 'app': Thanjoz Mart pays, so the shop is paid as if there were no offer. */
  paid_by: "shop" | "app";
  master_products?: Product;
  dealers?: { shop_name: string } | null;
};
type Listing = { selling_price: number; shop_price: number; mrp: number | null; is_active: boolean; out_of_stock_until: string | null };
type SplitRow = { master: string; dealer: string; selling: number; shop: number; qty: number; offer_id: string | null; was_price: number | null };
type Cover = { scope: "product" | "products" | "category"; face: string | null; productIds: string[] | null; categoryId: string | null };
type Line = { masterProductId: string; qty: number; price: number };

const COLS =
  "id, dealer_id, kind, master_product_id, scope, product_ids, category_id, catalog_categories(name, name_ta), pct, buy_qty, free_qty, mix, free_product_id, color, min_order, max_discount, valid_days, starts_at, ends_at, is_active, status, reject_reason, reviewed_at, pushed_at, created_at, banner_path, paid_by, master_products!shop_offers_master_product_id_fkey(name, name_ta, image_path, pack_size, mrp), free_product:master_products!shop_offers_free_product_id_fkey(name, name_ta, image_path), dealers(shop_name)";
const DEAD = '("CANCELLED","REFUNDED","RETURNED","DELIVERY_FAILED")';
const SWEEP_MS = 5 * 60_000;
const IST = 5.5 * 3600_000;
const num = (v: unknown) => (v == null ? null : Number(v));
/** Does this offer cover this product? (The SQL twin is shop_offer_covers.) */
const covers = (o: OfferRow, masterId: string) =>
  o.scope === "products" ? (o.product_ids ?? []).includes(masterId) : o.scope === "category" ? !!o.inCategory?.has(masterId) : o.master_product_id === masterId;
/** The product an offer hands over whatever is bought: a free gift, or an any-mix offer's free product. */
const handsOver = (o: OfferRow) => (o.kind === "free_gift" ? o.master_product_id : o.kind === "bogo" && o.mix ? o.free_product_id : null);
/** What the offer is on, for a notification: the product, the category, or "selected items". */
const coverLabel = (o: OfferRow) =>
  o.scope === "category" && o.catalog_categories
    ? { en: o.catalog_categories.name, ta: o.catalog_categories.name_ta || o.catalog_categories.name }
    : o.scope === "products"
      ? { en: "selected items", ta: "தேர்ந்தெடுத்த பொருட்கள்" }
      : { en: o.master_products?.name ?? "", ta: o.master_products?.name_ta || o.master_products?.name || "" };
const isLive = (o: Pick<OfferRow, "status" | "is_active" | "starts_at" | "ends_at">, now = Date.now()) =>
  o.status === "approved" && o.is_active && new Date(o.starts_at).getTime() <= now && new Date(o.ends_at).getTime() > now;

/**
 * Grocery shop offers: the shop makes them, the admin approves them, the
 * customer app shows them and orders apply them. The shop pays for every
 * offer it makes. The admin can make one that Thanjoz Mart pays for: then the
 * shop is paid as if there were no offer.
 *
 *  - price offers live in SQL (store_price_now): the catalogue and the order
 *    both read the offer price, so nothing here touches them at checkout;
 *  - buy-get-free and free gifts become ₹0 lines on the order;
 *  - "next order" offers stamp the order, and a delivered order gives the
 *    customer a personal coupon for their next order from the same shop.
 */
@Injectable()
export class GroceryOffersService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
    private readonly images: ImagesService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  onModuleInit() {
    // Offers approved for a later start are announced once they go live.
    this.timer = setInterval(() => void this.sweep().catch((e) => console.error("[offers] sweep", e)), SWEEP_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────────────────────── shapes ─────────────────────────

  private state(o: OfferRow): "waiting" | "rejected" | "off" | "scheduled" | "live" | "ended" {
    const now = Date.now();
    if (new Date(o.ends_at).getTime() <= now) return "ended";
    if (o.status === "rejected") return "rejected";
    if (o.status === "pending") return "waiting";
    if (!o.is_active) return "off";
    if (new Date(o.starts_at).getTime() > now) return "scheduled";
    return "live";
  }

  private shape(o: OfferRow, extra: { listing?: Listing | null; stats?: Stats } = {}) {
    const p = o.master_products ?? null;
    const l = extra.listing ?? null;
    let priceNow: { usual: number; offer: number; shopUsual: number; shopGets: number } | null = null;
    if (o.kind === "price" && o.scope === "product" && l && o.pct) {
      const usual = Number(l.selling_price);
      const offer = Math.round((Number(l.mrp ?? p?.mrp ?? usual) * (100 - Number(o.pct))) / 100);
      priceNow = { usual, offer, shopUsual: Number(l.shop_price), shopGets: o.paid_by === "app" ? Number(l.shop_price) : Number(l.shop_price) - (usual - offer) };
    }
    return {
      id: o.id,
      dealerId: o.dealer_id,
      shopName: o.dealers?.shop_name ?? null,
      kind: o.kind,
      productId: o.master_product_id,
      scope: o.kind === "price" || o.kind === "bogo" ? o.scope : "product",
      productIds: o.scope === "products" ? o.product_ids ?? [] : null,
      category: o.scope === "category" && o.category_id ? { id: o.category_id, name: o.catalog_categories?.name ?? "", nameTa: o.catalog_categories?.name_ta ?? null } : null,
      product: p ? { name: p.name, nameTa: p.name_ta, imagePath: p.image_path, packSize: p.pack_size, mrp: num(p.mrp) } : null,
      pct: num(o.pct),
      buyQty: o.buy_qty,
      freeQty: o.free_qty,
      mix: o.kind === "bogo" && o.scope !== "product" && !!o.mix,
      freeProductId: o.free_product_id,
      freeProduct: o.free_product ? { name: o.free_product.name, nameTa: o.free_product.name_ta, imagePath: o.free_product.image_path } : null,
      color: o.color,
      minOrder: num(o.min_order),
      maxDiscount: num(o.max_discount),
      validDays: o.valid_days,
      startsAt: o.starts_at,
      endsAt: o.ends_at,
      isActive: o.is_active,
      status: o.status,
      state: this.state(o),
      rejectReason: o.reject_reason,
      pushedAt: o.pushed_at,
      createdAt: o.created_at,
      bannerPath: o.banner_path,
      paidBy: o.paid_by,
      priceNow,
      stats: extra.stats ?? { orders: 0, freeUnits: 0, couponsGiven: 0, couponsUsed: 0, given: 0 },
    };
  }

  private async listings(rows: OfferRow[]) {
    const keys = rows.filter((o) => o.kind === "price" && o.master_product_id);
    if (!keys.length) return new Map<string, Listing>();
    const { data } = await this.db
      .from("store_products")
      .select("dealer_id, master_product_id, selling_price, shop_price, mrp, is_active, out_of_stock_until")
      .in("dealer_id", [...new Set(keys.map((k) => k.dealer_id))])
      .in("master_product_id", [...new Set(keys.map((k) => k.master_product_id!))]);
    return new Map((data ?? []).map((l) => [`${l.dealer_id}:${l.master_product_id}`, l as unknown as Listing]));
  }

  /** What each offer has done so far (cancelled orders not counted). */
  private async stats(ids: string[]): Promise<Map<string, Stats>> {
    const out = new Map<string, Stats>();
    if (!ids.length) return out;
    const get = (id: string) => out.get(id) ?? (out.set(id, { orders: 0, freeUnits: 0, couponsGiven: 0, couponsUsed: 0, given: 0 }), out.get(id)!);
    const [{ data: lines }, { data: earned }, { data: coupons }] = await Promise.all([
      this.db.from("order_items").select("order_id, shop_offer_id, is_free, requested_kg, was_price, unit_price_per_kg, orders!inner(status)").in("shop_offer_id", ids).not("orders.status", "in", DEAD),
      this.db.from("orders").select("id, earns_offer_id").in("earns_offer_id", ids).not("status", "in", DEAD),
      this.db.from("customer_coupons").select("shop_offer_id, used_order_id, used_order:orders!customer_coupons_used_order_id_fkey(status, discount_amount)").in("shop_offer_id", ids),
    ]);
    const seen = new Set<string>();
    for (const l of lines ?? []) {
      const s = get(l.shop_offer_id as string);
      const key = `${l.shop_offer_id}:${l.order_id}`;
      if (!seen.has(key)) (seen.add(key), (s.orders += 1));
      if (l.is_free) s.freeUnits += Number(l.requested_kg);
      else if (l.was_price != null) s.given += Math.round((Number(l.was_price) - Number(l.unit_price_per_kg)) * Number(l.requested_kg));
    }
    for (const o of earned ?? []) get(o.earns_offer_id as string).orders += 1;
    for (const c of coupons ?? []) {
      const s = get(c.shop_offer_id as string);
      s.couponsGiven += 1;
      const used = c.used_order as unknown as { status: string; discount_amount: number | null } | null;
      if (c.used_order_id && used && !["CANCELLED", "REFUNDED", "RETURNED", "DELIVERY_FAILED"].includes(used.status)) {
        s.couponsUsed += 1;
        s.given += Number(used.discount_amount ?? 0);
      }
    }
    return out;
  }

  private async shapeAll(rows: OfferRow[]) {
    const [listings, stats] = await Promise.all([this.listings(rows), this.stats(rows.map((r) => r.id))]);
    return rows.map((o) => this.shape(o, { listing: listings.get(`${o.dealer_id}:${o.master_product_id}`), stats: stats.get(o.id) }));
  }

  // ───────────────────────── shop ─────────────────────────

  async dealerOf(profileId: string) {
    const { data } = await this.db.from("dealers").select("id, store_type").eq("profile_id", profileId).eq("is_active", true).maybeSingle();
    if (!data) throw new ForbiddenException("Not a shop");
    if (data.store_type !== "grocery") throw new ForbiddenException("Offers are for grocery shops");
    return data.id as string;
  }

  async listForShop(dealerId: string) {
    const { data, error } = await this.db.from("shop_offers").select(COLS).eq("dealer_id", dealerId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new BadRequestException(error.message);
    return this.shapeAll((data ?? []) as unknown as OfferRow[]);
  }

  /**
   * Checks an offer against the shop's own listings and works out what it
   * covers; throws a message the shop can act on. A chosen product must be
   * able to take the discount; in a category, products that can't are just
   * left at their usual price.
   */
  private async validate(dealerId: string, input: ShopOfferInput, id?: string, appPays = false): Promise<Cover> {
    if (input.kind === "next_order") return { scope: "product", face: null, productIds: null, categoryId: null };
    const many = input.kind === "price" || input.kind === "bogo";
    const scope = many ? input.scope ?? "product" : "product";
    type L = { master_product_id: string; selling_price: number; shop_price: number; mrp: number | null; is_active: boolean; master_products: { name: string; mrp: number | null; category_id: string | null } | null };
    const q = () => this.db.from("store_products").select("master_product_id, selling_price, shop_price, mrp, is_active, master_products(name, mrp, category_id)").eq("dealer_id", dealerId);
    let rows: L[] = [];
    if (scope === "category") {
      const { data: kids } = await this.db.from("catalog_categories").select("id").eq("parent_id", input.categoryId!);
      const cats = [input.categoryId!, ...(kids ?? []).map((k) => k.id as string)];
      const { data } = await q().eq("is_active", true).limit(1000);
      rows = ((data ?? []) as unknown as L[]).filter((l) => l.master_products?.category_id && cats.includes(l.master_products.category_id));
      if (!rows.length) throw new BadRequestException("The shop has no products in this category");
    } else {
      const ids = scope === "products" ? [...new Set(input.productIds!)] : [input.masterProductId!];
      const { data } = await q().in("master_product_id", ids);
      const got = new Map(((data ?? []) as unknown as L[]).map((l) => [l.master_product_id, l]));
      if (got.size < ids.length) throw new BadRequestException(ids.length > 1 ? "One of these products is not in the shop's list" : "This product is not in the shop's list");
      rows = ids.map((i) => got.get(i)!);
    }
    if (input.kind === "price") {
      let fits = 0;
      for (const l of rows) {
        const usual = Number(l.selling_price);
        const base = Number(l.mrp ?? l.master_products?.mrp ?? usual);
        const offer = Math.round((base * (100 - Number(input.pct))) / 100);
        // When Thanjoz Mart pays, the shop price does not move.
        const shopGets = appPays ? Number(l.shop_price) : Number(l.shop_price) - (usual - offer);
        if (offer < usual && shopGets > 0) {
          fits += 1;
          continue;
        }
        if (scope === "category") continue;
        const name = rows.length > 1 ? `${l.master_products?.name ?? "A product"}: at` : "At";
        if (offer >= usual) {
          const least = Math.floor((1 - (usual - 1) / base) * 100) + 1;
          throw new BadRequestException(`${name} ${input.pct}% off the price is ₹${offer}, not lower than today's ₹${usual}. Choose at least ${Math.min(least, 99)}%${rows.length > 1 ? ", or leave this product out" : ""}.`);
        }
        const most = Math.max(0, Math.floor(((Number(l.shop_price) - 1 - usual + base) / base) * 100));
        throw new BadRequestException(`${name} ${input.pct}% off the customer pays ₹${offer} and the shop would get ₹${shopGets}. Choose at most ${most}%${rows.length > 1 ? ", or leave this product out" : ""}.`);
      }
      if (!fits) throw new BadRequestException(`At ${input.pct}% off no product in this category gets a lower price the shop can give. Try another discount, or choose the products yourself.`);
    }
    if (many && scope === "product") {
      // One offer of a kind per product at a time.
      const { data: clash } = await this.db
        .from("shop_offers")
        .select("id")
        .eq("dealer_id", dealerId)
        .eq("kind", input.kind)
        .eq("scope", "product")
        .eq("master_product_id", input.masterProductId!)
        .neq("status", "rejected")
        .lt("starts_at", input.endsAt)
        .gt("ends_at", input.startsAt);
      if ((clash ?? []).some((c) => c.id !== id)) throw new BadRequestException("This product already has an offer like this for those dates");
    }
    if (input.kind === "bogo" && scope !== "product" && input.mix && input.freeProductId) {
      const { data: gift } = await this.db.from("store_products").select("is_active").eq("dealer_id", dealerId).eq("master_product_id", input.freeProductId).maybeSingle();
      if (!gift?.is_active) throw new BadRequestException("The free item is not on sale in the shop's list");
    }
    // One chosen product is simply a one-product offer.
    if (scope === "products" && rows.length === 1) return { scope: "product", face: rows[0].master_product_id, productIds: null, categoryId: null };
    return {
      scope,
      face: rows[0].master_product_id,
      productIds: scope === "products" ? rows.map((r) => r.master_product_id) : null,
      categoryId: scope === "category" ? input.categoryId! : null,
    };
  }

  private row(input: ShopOfferInput, cover: Cover) {
    const k = input.kind;
    return {
      kind: k,
      master_product_id: cover.face,
      scope: cover.scope,
      product_ids: cover.productIds,
      category_id: cover.categoryId,
      pct: k === "price" || k === "next_order" ? input.pct : null,
      buy_qty: k === "bogo" ? input.buyQty : null,
      free_qty: k === "bogo" || k === "free_gift" ? input.freeQty : null,
      // Any-mix only means something when the offer is on more than one product.
      mix: k === "bogo" && cover.scope !== "product" && !!input.mix,
      free_product_id: k === "bogo" && cover.scope !== "product" && input.mix ? input.freeProductId ?? null : null,
      color: input.color ?? null,
      min_order: k === "free_gift" || k === "next_order" ? input.minOrder : null,
      max_discount: k === "next_order" ? input.maxDiscount : null,
      valid_days: k === "next_order" ? input.validDays : null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_active: input.isActive ?? true,
    };
  }

  /** A new or changed offer from the shop waits for the admin again. */
  async saveForShop(dealerId: string, profileId: string, input: ShopOfferInput, id?: string) {
    if (id) await this.ownOffer(id, dealerId);
    const cover = await this.validate(dealerId, input, id);
    const row = { ...this.row(input, cover), status: "pending", reject_reason: null, reviewed_by: null, reviewed_at: null };
    if (id) {
      const { data, error } = await this.db.from("shop_offers").update(row).eq("id", id).eq("dealer_id", dealerId).select("id");
      if (error) throw new BadRequestException(error.message);
      if (!data?.length) throw new NotFoundException("Offer not found");
      return { id };
    }
    const { data, error } = await this.db.from("shop_offers").insert({ ...row, dealer_id: dealerId, created_by: profileId }).select("id").single();
    if (error) throw new BadRequestException(error.message);
    return { id: data.id as string };
  }

  /** The shop's on/off switch. Turning an approved offer on may announce it. */
  async setActive(id: string, active: boolean, dealerId?: string) {
    if (dealerId) await this.ownOffer(id, dealerId);
    let q = this.db.from("shop_offers").update({ is_active: active }).eq("id", id);
    if (dealerId) q = q.eq("dealer_id", dealerId);
    const { data, error } = await q.select("id");
    if (error) throw new BadRequestException(error.message);
    if (!data?.length) throw new NotFoundException("Offer not found");
    if (active) void this.pushIfDue(id);
    return { id, isActive: active };
  }

  /** End now: kept for the records (orders point at it), gone for customers. */
  async end(id: string, dealerId?: string) {
    if (dealerId) await this.ownOffer(id, dealerId);
    const now = new Date().toISOString();
    const { data: o } = await this.db.from("shop_offers").select("starts_at").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Offer not found");
    // A scheduled offer ended before it started becomes a one-second offer in the past.
    const patch = new Date(o.starts_at).getTime() >= Date.now() ? { starts_at: new Date(Date.now() - 2000).toISOString(), ends_at: new Date(Date.now() - 1000).toISOString() } : { ends_at: now };
    let q = this.db.from("shop_offers").update(patch).eq("id", id);
    if (dealerId) q = q.eq("dealer_id", dealerId);
    const { error } = await q;
    if (error) throw new BadRequestException(error.message);
    return { id };
  }

  /** A shop can change only the offers it pays for. */
  private async ownOffer(id: string, dealerId: string) {
    const { data: o } = await this.db.from("shop_offers").select("paid_by").eq("id", id).eq("dealer_id", dealerId).maybeSingle();
    if (!o) throw new NotFoundException("Offer not found");
    if (o.paid_by === "app") throw new ForbiddenException("Thanjoz Mart runs this offer. Call us to change it.");
  }

  /**
   * The offer's own banner picture (null clears it). A shop's new picture
   * waits for the admin again, like any other change.
   */
  async setBanner(id: string, file: { buffer: Buffer; mimetype?: string; size: number } | null, dealerId?: string) {
    if (dealerId) await this.ownOffer(id, dealerId);
    const { data: o } = await this.db.from("shop_offers").select("banner_path").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Offer not found");
    const stored = file ? await this.images.store("offer", id, file) : null;
    const patch = { banner_path: stored?.path ?? null, ...(dealerId && stored ? { status: "pending", reject_reason: null, reviewed_by: null, reviewed_at: null } : {}) };
    const { error } = await this.db.from("shop_offers").update(patch).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    if (o.banner_path && o.banner_path !== stored?.path && /^offer\//.test(o.banner_path as string)) await this.images.remove(o.banner_path as string);
    return { id, bannerPath: stored?.path ?? null };
  }

  // ───────────────────────── admin ─────────────────────────

  async adminList() {
    const { data, error } = await this.db.from("shop_offers").select(COLS).order("created_at", { ascending: false }).limit(300);
    if (error) throw new BadRequestException(error.message);
    const rows = await this.shapeAll((data ?? []) as unknown as OfferRow[]);
    const { data: shops } = await this.db.from("dealers").select("id, shop_name").eq("store_type", "grocery").eq("is_active", true).order("shop_name");
    return { offers: rows, shops: (shops ?? []).map((s) => ({ id: s.id as string, name: s.shop_name as string })) };
  }

  /** The admin's own offer for a shop: approved at once. */
  async adminSave(adminId: string, input: ShopOfferInput, id?: string) {
    let dealerId = input.dealerId;
    let paidBy = input.paidBy ?? "shop";
    if (id) {
      const { data: o } = await this.db.from("shop_offers").select("dealer_id, paid_by").eq("id", id).maybeSingle();
      if (!o) throw new NotFoundException("Offer not found");
      dealerId = o.dealer_id as string;
      paidBy = input.paidBy ?? (o.paid_by as "shop" | "app");
    }
    if (!dealerId) throw new BadRequestException("Choose the shop");
    const cover = await this.validate(dealerId, input, id, paidBy === "app");
    const row = { ...this.row(input, cover), paid_by: paidBy, status: "approved", reject_reason: null, reviewed_by: adminId, reviewed_at: new Date().toISOString() };
    let offerId = id;
    if (id) {
      const { error } = await this.db.from("shop_offers").update(row).eq("id", id);
      if (error) throw new BadRequestException(error.message);
    } else {
      const { data, error } = await this.db.from("shop_offers").insert({ ...row, dealer_id: dealerId, created_by: adminId }).select("id").single();
      if (error) throw new BadRequestException(error.message);
      offerId = data.id as string;
    }
    void this.pushIfDue(offerId!);
    return { id: offerId };
  }

  async review(adminId: string, id: string, approve: boolean, reason?: string) {
    const { data: o } = await this.db.from("shop_offers").select("id, dealer_id, kind, master_product_id, scope, product_ids, category_id, pct, buy_qty, free_qty, min_order, max_discount, valid_days, starts_at, ends_at, paid_by").eq("id", id).maybeSingle();
    if (!o) throw new NotFoundException("Offer not found");
    if (approve) {
      // Prices may have moved since the shop asked; check again.
      await this.validate(o.dealer_id as string, {
        kind: o.kind,
        masterProductId: o.master_product_id,
        scope: o.scope,
        productIds: o.product_ids,
        categoryId: o.category_id,
        pct: num(o.pct),
        buyQty: o.buy_qty,
        freeQty: o.free_qty,
        minOrder: num(o.min_order),
        maxDiscount: num(o.max_discount),
        validDays: o.valid_days,
        startsAt: o.starts_at,
        endsAt: o.ends_at,
      } as ShopOfferInput, id, o.paid_by === "app");
    } else if (!reason) throw new BadRequestException("Say why, so the shop can fix it");
    const { error } = await this.db
      .from("shop_offers")
      .update({ status: approve ? "approved" : "rejected", reject_reason: approve ? null : reason, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new BadRequestException(error.message);
    void this.notifyShop(o.dealer_id as string, approve, reason);
    if (approve) void this.pushIfDue(id);
    return { id, status: approve ? "approved" : "rejected" };
  }

  private async notifyShop(dealerId: string, approved: boolean, reason?: string) {
    try {
      const { data: d } = await this.db.from("dealers").select("profile_id").eq("id", dealerId).maybeSingle();
      if (!d?.profile_id) return;
      await this.push.toProfiles([d.profile_id as string], approved
        ? { title: "Offer approved ✅", body: "Your offer is live for customers near you.", ta: { title: "ஆஃபர் ஏற்கப்பட்டது ✅", body: "உங்கள் ஆஃபர் அருகிலுள்ள வாடிக்கையாளர்களுக்கு இப்போது தெரியும்." }, data: { kind: "shop_offer" }, channelId: "default" }
        : { title: "Offer needs a change", body: reason ?? "Open Offers to see why.", ta: { title: "ஆஃபரில் மாற்றம் தேவை", body: reason ?? "காரணத்தை ஆஃபர்கள் பக்கத்தில் பாருங்கள்." }, data: { kind: "shop_offer" }, channelId: "default" });
    } catch (e) {
      console.warn("[offers] shop push", (e as Error).message);
    }
  }

  // ───────────────────────── customer push ─────────────────────────

  /** Live approved offers nobody has been told about yet. */
  private async sweep() {
    const now = new Date().toISOString();
    const { data } = await this.db.from("shop_offers").select("id").eq("status", "approved").eq("is_active", true).is("pushed_at", null).lte("starts_at", now).gt("ends_at", now).limit(20);
    for (const o of data ?? []) await this.pushIfDue(o.id as string);
  }

  /**
   * Tell customers the shop serves about a live offer: at most one offer
   * push per shop per (Indian) day. One that can't go today goes tomorrow if
   * the offer is still on.
   */
  async pushIfDue(id: string) {
    try {
      const { data: o } = await this.db.from("shop_offers").select(COLS).eq("id", id).maybeSingle();
      const offer = o as unknown as OfferRow | null;
      if (!offer || offer.pushed_at || !isLive(offer)) return;
      const dayStart = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST).toISOString();
      const { data: claimed } = await this.db
        .from("dealers")
        .update({ last_offer_push_at: new Date().toISOString() })
        .eq("id", offer.dealer_id)
        .or(`last_offer_push_at.is.null,last_offer_push_at.lt.${dayStart}`)
        .select("id");
      if (!claimed?.length) return;
      await this.db.from("shop_offers").update({ pushed_at: new Date().toISOString() }).eq("id", id);
      const { data: who } = await this.db.rpc("offer_audience", { p_dealer: offer.dealer_id });
      const ids = ((who ?? []) as { user_id: string }[]).map((w) => w.user_id);
      if (!ids.length) return;
      const p = coverLabel(offer);
      const text = shopOfferPush({ kind: offer.kind, pct: num(offer.pct), buyQty: offer.buy_qty, freeQty: offer.free_qty, mix: offer.mix, minOrder: num(offer.min_order), maxDiscount: num(offer.max_discount), product: p.en, productTa: p.ta });
      const r = await this.push.toProfiles(ids, { ...text, data: { kind: "grocery_offer", offerId: id, productId: (offer.kind === "price" || offer.kind === "bogo") && offer.scope === "product" ? offer.master_product_id : null, list: (offer.kind === "price" || offer.kind === "bogo") && offer.scope !== "product" ? "1" : null }, channelId: "offers" });
      console.log(`[offers] push ${id}: sent ${r.sent}, failed ${r.failed}`);
    } catch (e) {
      console.warn("[offers] push", (e as Error).message);
    }
  }

  // ───────────────────────── basket maths ─────────────────────────

  private async liveFor(dealerIds: string[]) {
    if (!dealerIds.length) return [] as OfferRow[];
    const now = new Date().toISOString();
    const { data } = await this.db
      .from("shop_offers")
      .select(COLS)
      .in("dealer_id", dealerIds)
      .in("kind", ["bogo", "free_gift", "next_order"])
      .eq("status", "approved")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gt("ends_at", now);
    const rows = (data ?? []) as unknown as OfferRow[];
    // Category offers: load the category's products once, so each basket line is a set lookup.
    const cats = [...new Set(rows.filter((o) => o.kind === "bogo" && o.scope === "category" && o.category_id).map((o) => o.category_id!))];
    if (cats.length) {
      const { data: kids } = await this.db.from("catalog_categories").select("id, parent_id").in("parent_id", cats);
      const parentOf = new Map((kids ?? []).map((k) => [k.id as string, k.parent_id as string]));
      const { data: prods } = await this.db.from("master_products").select("id, category_id").in("category_id", [...cats, ...parentOf.keys()]).limit(5000);
      for (const o of rows) {
        if (o.kind !== "bogo" || o.scope !== "category") continue;
        o.inCategory = new Set((prods ?? []).filter((m) => m.category_id === o.category_id || parentOf.get(m.category_id as string) === o.category_id).map((m) => m.id as string));
      }
    }
    return rows;
  }

  /** Gift items the shop can actually hand over now (listed, on, in stock). */
  private async giftable(rows: OfferRow[]) {
    const gifts = rows.filter((o) => handsOver(o));
    if (!gifts.length) return new Set<string>();
    const { data } = await this.db
      .from("store_products")
      .select("dealer_id, master_product_id, is_active, out_of_stock_until")
      .in("dealer_id", [...new Set(gifts.map((g) => g.dealer_id))])
      .in("master_product_id", [...new Set(gifts.map((g) => handsOver(g)!))]);
    const now = Date.now();
    return new Set((data ?? []).filter((l) => l.is_active && (!l.out_of_stock_until || new Date(l.out_of_stock_until).getTime() <= now)).map((l) => `${l.dealer_id}:${l.master_product_id}`));
  }

  private async openCoupons(customerId: string, dealerIds: string[]) {
    if (!dealerIds.length) return [];
    const { data } = await this.db
      .from("customer_coupons")
      .select("id, dealer_id, pct, max_discount, expires_at, paid_by")
      .eq("customer_id", customerId)
      .is("used_order_id", null)
      .gt("expires_at", new Date().toISOString())
      .in("dealer_id", dealerIds);
    return (data ?? []).map((c) => ({ id: c.id as string, dealerId: c.dealer_id as string, pct: Number(c.pct), max: Number(c.max_discount), expiresAt: c.expires_at as string, appPays: c.paid_by === "app" }));
  }

  /**
   * Everything the offers do to one shop's part of a basket: free units,
   * the gift reached (or the next one to reach), the coupon it earns.
   */
  private plan(dealerId: string, lines: Line[], offers: OfferRow[], giftOk: Set<string>) {
    const mine = offers.filter((o) => o.dealer_id === dealerId);
    const sub = lines.reduce((s, l) => s + Math.round(l.price * l.qty), 0);
    const free: { offer: OfferRow; masterProductId: string; qty: number; reason: "bogo" | "gift" }[] = [];
    // Any-mix offers count their products together; the rest count each product on its own.
    const mixed = new Map<string, { offer: OfferRow; lines: Line[] }>();
    for (const l of lines) {
      const b = mine.filter((o) => o.kind === "bogo" && covers(o, l.masterProductId)).sort((a, b2) => b2.free_qty! / b2.buy_qty! - a.free_qty! / a.buy_qty!)[0];
      if (b?.mix && b.scope !== "product") {
        const g = mixed.get(b.id) ?? { offer: b, lines: [] };
        g.lines.push(l);
        mixed.set(b.id, g);
        continue;
      }
      const n = b ? bogoFreeUnits(l.qty, b.buy_qty!, b.free_qty!) : 0;
      if (n > 0) free.push({ offer: b, masterProductId: l.masterProductId, qty: n, reason: "bogo" });
    }
    for (const g of mixed.values()) {
      // a loose item (0.5 kg of sugar) still counts as one of the items bought
      const n = bogoFreeUnits(g.lines.reduce((s, l) => s + Math.max(1, Math.floor(l.qty)), 0), g.offer.buy_qty!, g.offer.free_qty!);
      // The free one is the product the offer names; without it (or when the shop is out of it), more of the lowest-priced product of the mix.
      const named = g.offer.free_product_id && giftOk.has(`${dealerId}:${g.offer.free_product_id}`) ? g.offer.free_product_id : null;
      const cheapest = [...g.lines].sort((a, b) => a.price - b.price)[0];
      if (n > 0) free.push({ offer: g.offer, masterProductId: named ?? cheapest.masterProductId, qty: n, reason: "bogo" });
    }
    const gifts = mine.filter((o) => o.kind === "free_gift" && giftOk.has(`${dealerId}:${o.master_product_id}`)).sort((a, b) => Number(a.min_order) - Number(b.min_order));
    const reached = gifts.filter((g) => sub >= Number(g.min_order)).pop();
    if (reached) free.push({ offer: reached, masterProductId: reached.master_product_id!, qty: reached.free_qty ?? 1, reason: "gift" });
    const nextGift = gifts.find((g) => sub < Number(g.min_order));
    const earners = mine.filter((o) => o.kind === "next_order").sort((a, b) => Number(a.min_order) - Number(b.min_order));
    const earns = earners.filter((e) => sub >= Number(e.min_order)).sort((a, b) => Number(b.max_discount) - Number(a.max_discount))[0] ?? null;
    const nextEarn = earns ? null : earners[0] ?? null;
    return { sub, free, nextGift, earns, nextEarn };
  }

  /** The cart preview: what the offers would do to this basket at this address. */
  async quote(customerId: string, addressId: string, items: { masterProductId: string; qty: number }[]) {
    const empty = { free: [], giftHint: null, coupon: null, earns: null, earnHint: null, saved: 0 };
    if (!items.length) return empty;
    const { data: a } = await this.db.from("addresses").select("pincode, lat, lng").eq("id", addressId).eq("user_id", customerId).maybeSingle();
    if (!a) return empty;
    const { data: split, error } = await this.db.rpc("grocery_split", {
      p_pincode: a.pincode,
      p_lat: a.lat,
      p_lng: a.lng,
      p_items: items.map((i) => ({ master_product_id: i.masterProductId, qty: i.qty })),
    });
    if (error) throw new BadRequestException(error.message);
    const rows = (split ?? []) as SplitRow[];
    const byDealer = new Map<string, Line[]>();
    for (const r of rows) {
      const list = byDealer.get(r.dealer) ?? [];
      list.push({ masterProductId: r.master, qty: Number(r.qty), price: Number(r.selling) });
      byDealer.set(r.dealer, list);
    }
    // Biggest part first: hints speak about the shop most of the basket goes to.
    const dealers = [...byDealer.keys()].sort((x, y) => byDealer.get(y)!.length - byDealer.get(x)!.length);
    const offers = await this.liveFor(dealers);
    const [giftOk, coupons] = await Promise.all([this.giftable(offers), this.openCoupons(customerId, dealers)]);

    const free: { masterProductId: string; name: string; nameTa: string | null; imagePath: string | null; qty: number; reason: "bogo" | "gift"; value: number }[] = [];
    let giftHint: { need: number; minOrder: number; name: string; nameTa: string | null; imagePath: string | null } | null = null;
    let earns: { pct: number; maxDiscount: number; validDays: number } | null = null;
    let earnHint: { need: number; pct: number; maxDiscount: number } | null = null;
    let coupon: { id: string; pct: number; maxDiscount: number; discount: number; expiresAt: string } | null = null;
    const priceOf = new Map(rows.map((r) => [`${r.dealer}:${r.master}`, Number(r.selling)]));
    const usual = await this.usualPrices(free.length ? [] : offers.filter((o) => handsOver(o)));
    const plans = dealers.map((d) => ({ d, p: this.plan(d, byDealer.get(d)!, offers, giftOk) }));
    // A buy-and-get-free line gives the product it names, or the one that was bought: not the offer's face product.
    const boughtIds = [...new Set(plans.flatMap((x) => x.p.free.filter((f) => f.reason === "bogo").map((f) => f.masterProductId)))];
    const { data: bought } = boughtIds.length
      ? await this.db.from("master_products").select("id, name, name_ta, image_path").in("id", boughtIds)
      : { data: [] };
    const boughtBy = new Map((bought ?? []).map((m) => [m.id as string, m as { name: string; name_ta: string | null; image_path: string | null }]));
    for (const { d, p } of plans) {
      for (const f of p.free) {
        const m = (f.reason === "bogo" ? boughtBy.get(f.masterProductId) : null) ?? f.offer.master_products;
        const each = priceOf.get(`${d}:${f.masterProductId}`) ?? usual.get(`${d}:${f.masterProductId}`) ?? 0;
        free.push({ masterProductId: f.masterProductId, name: m?.name ?? "", nameTa: m?.name_ta ?? null, imagePath: m?.image_path ?? null, qty: f.qty, reason: f.reason, value: Math.round(each * f.qty) });
      }
      if (!giftHint && p.nextGift) {
        const m = p.nextGift.master_products;
        giftHint = { need: Math.ceil(Number(p.nextGift.min_order) - p.sub), minOrder: Number(p.nextGift.min_order), name: m?.name ?? "", nameTa: m?.name_ta ?? null, imagePath: m?.image_path ?? null };
      }
      if (!earns && p.earns) earns = { pct: Number(p.earns.pct), maxDiscount: Number(p.earns.max_discount), validDays: p.earns.valid_days ?? 7 };
      if (!earns && !earnHint && p.nextEarn) earnHint = { need: Math.ceil(Number(p.nextEarn.min_order) - p.sub), pct: Number(p.nextEarn.pct), maxDiscount: Number(p.nextEarn.max_discount) };
      for (const c of coupons.filter((x) => x.dealerId === d)) {
        const saving = couponSaving(p.sub, c.pct, c.max);
        if (saving > 0 && (!coupon || saving > coupon.discount)) coupon = { id: c.id, pct: c.pct, maxDiscount: c.max, discount: saving, expiresAt: c.expiresAt };
      }
    }
    if (earns) earnHint = null;
    const priceSaved = rows.reduce((s, r) => s + (r.was_price != null ? Math.round((Number(r.was_price) - Number(r.selling)) * Number(r.qty)) : 0), 0);
    return { free, giftHint, coupon, earns, earnHint, saved: priceSaved + free.reduce((s, f) => s + f.value, 0) + (coupon?.discount ?? 0) };
  }

  private async usualPrices(gifts: OfferRow[]) {
    if (!gifts.length) return new Map<string, number>();
    const { data } = await this.db
      .from("store_products")
      .select("dealer_id, master_product_id, selling_price")
      .in("dealer_id", [...new Set(gifts.map((g) => g.dealer_id))])
      .in("master_product_id", [...new Set(gifts.map((g) => handsOver(g)!))]);
    return new Map((data ?? []).map((l) => [`${l.dealer_id}:${l.master_product_id}`, Number(l.selling_price)]));
  }

  /**
   * Stamp the offers on freshly placed grocery orders (one per shop): free
   * lines, the coupon earned, and the customer's own coupon (one per basket).
   * Returns each order's amount after the coupon.
   */
  async applyToOrders(customerId: string, orders: { orderId: string; dealerId: string }[]) {
    const out = new Map<string, number>();
    if (!orders.length) return out;
    const dealers = orders.map((o) => o.dealerId);
    const offers = await this.liveFor(dealers);
    const [giftOk, coupons] = await Promise.all([this.giftable(offers), this.openCoupons(customerId, dealers)]);
    let best: { orderId: string; couponId: string; discount: number; appPays: boolean } | null = null;
    const amounts = new Map<string, number>();
    for (const o of orders) {
      const { data: order } = await this.db.from("orders").select("est_amount, order_items(master_product_id, requested_kg, unit_price_per_kg, is_free)").eq("id", o.orderId).single();
      if (!order) continue;
      amounts.set(o.orderId, Number(order.est_amount));
      const lines = (order.order_items as { master_product_id: string; requested_kg: number; unit_price_per_kg: number; is_free: boolean }[])
        .filter((l) => !l.is_free && l.master_product_id)
        .map((l) => ({ masterProductId: l.master_product_id, qty: Number(l.requested_kg), price: Number(l.unit_price_per_kg) }));
      const p = this.plan(o.dealerId, lines, offers, giftOk);
      // Free units Thanjoz Mart pays for are paid to the shop at its shop price.
      const paidFree = p.free.filter((f) => f.offer.paid_by === "app").map((f) => f.masterProductId);
      const { data: sp } = paidFree.length ? await this.db.from("store_products").select("master_product_id, shop_price").eq("dealer_id", o.dealerId).in("master_product_id", paidFree) : { data: [] };
      const shopPrice = new Map((sp ?? []).map((l) => [l.master_product_id as string, Number(l.shop_price)]));
      if (p.free.length) {
        const { error } = await this.db.from("order_items").insert(
          p.free.map((f) => ({
            order_id: o.orderId,
            master_product_id: f.masterProductId,
            requested_kg: f.qty,
            cut: "standard",
            unit_price_per_kg: 0,
            shop_unit_price: f.offer.paid_by === "app" ? shopPrice.get(f.masterProductId) ?? 0 : 0,
            is_free: true,
            shop_offer_id: f.offer.id,
            notes: f.reason === "bogo" ? `Offer: buy ${f.offer.mix ? "any " : ""}${f.offer.buy_qty} get ${f.offer.free_qty} free` : `Offer: free gift above ₹${Number(f.offer.min_order)}`,
          })),
        );
        if (error) console.error("[offers] free lines", o.orderId, error.message);
      }
      if (p.earns) await this.db.from("orders").update({ earns_offer_id: p.earns.id }).eq("id", o.orderId);
      for (const c of coupons.filter((x) => x.dealerId === o.dealerId)) {
        const saving = couponSaving(p.sub, c.pct, c.max);
        if (saving > 0 && (!best || saving > best.discount)) best = { orderId: o.orderId, couponId: c.id, discount: saving, appPays: c.appPays };
      }
    }
    if (best) {
      const { data: claimed } = await this.db
        .from("customer_coupons")
        .update({ used_order_id: best.orderId, used_at: new Date().toISOString() })
        .eq("id", best.couponId)
        .is("used_order_id", null)
        .select("id");
      if (claimed?.length) {
        const amount = (amounts.get(best.orderId) ?? 0) - best.discount;
        // Whoever gave the coupon pays for it: the shop's share is all of it, or none when Thanjoz Mart pays.
        await this.db.from("orders").update({ est_amount: amount, discount_amount: best.discount, discount_shop_share: best.appPays ? 0 : best.discount, customer_coupon_id: best.couponId }).eq("id", best.orderId);
        amounts.set(best.orderId, amount);
      }
    }
    for (const [k, v] of amounts) out.set(k, v);
    return out;
  }

  /** Coupons the customer holds now, for the cart and profile. */
  async myCoupons(customerId: string) {
    const { data } = await this.db
      .from("customer_coupons")
      .select("id, pct, max_discount, expires_at")
      .eq("customer_id", customerId)
      .is("used_order_id", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at");
    return (data ?? []).map((c) => ({ id: c.id as string, pct: Number(c.pct), maxDiscount: Number(c.max_discount), expiresAt: c.expires_at as string }));
  }
}

type Stats = { orders: number; freeUnits: number; couponsGiven: number; couponsUsed: number; given: number };
