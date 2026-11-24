import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CatalogCategoryInput,
  CustomProductInput,
  MasterProductInput,
} from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { mapRows, normaliseUnit, parseCsv } from "./csv";

/**
 * Grocery catalog (G1): categories, the shared product master with its
 * approval queue, each shop's two-price listings, billing-export imports and
 * delivery-fee rules. See docs/grocery-g1.md.
 *
 * Every price write passes through setPrices(): it enforces
 *   shop ≤ selling ≤ MRP   (and selling = shop when price_mode = 'same')
 * before the DB CHECKs do, so callers get a readable 400 instead of a
 * constraint name, and it logs store_price_history. Writes are service_role
 * (RLS bypassed) — callers must have resolved the dealer/admin first.
 */

type Vertical = "meat" | "grocery";
type Actor = { id: string };

type Master = {
  id: string;
  vertical_type: Vertical;
  category_id: string | null;
  barcode: string | null;
  name: string;
  name_ta: string | null;
  brand: string | null;
  pack_size: string | null;
  unit: "piece" | "pack" | "kg";
  min_qty: number;
  qty_step: number;
  mrp: number | null;
  image_path: string | null;
  scope: "shared" | "store";
  status: "pending" | "approved" | "rejected";
  owner_dealer_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Listing = {
  dealer_id: string;
  master_product_id: string;
  shop_price: number;
  selling_price: number;
  mrp: number | null;
  price_mode: "same" | "custom";
  selling_set_by: "store" | "admin";
  out_of_stock_until: string | null;
  stock_qty: number | null;
  is_active: boolean;
  updated_at: string;
};

const MASTER_COLS =
  "id, vertical_type, category_id, barcode, name, name_ta, brand, pack_size, unit, min_qty, qty_step, mrp, image_path, description, description_ta, scope, status, owner_dealer_id, reviewed_by, reviewed_at, review_note, is_active, created_at, updated_at";
const LISTING_COLS =
  "dealer_id, master_product_id, shop_price, selling_price, mrp, price_mode, selling_set_by, out_of_stock_until, stock_qty, is_active, updated_at";

const money = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CatalogService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() {
    return this.supabase.admin;
  }

  // ───────────────────────────── verticals ─────────────────────────────
  async verticals() {
    const { data, error } = await this.db.from("verticals").select("type, label, label_ta, sort, is_active").order("sort");
    if (error) throw error;
    return data;
  }

  async setVertical(type: string, isActive: boolean) {
    const { data, error } = await this.db.from("verticals").update({ is_active: isActive }).eq("type", type).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("No such vertical");
    return data;
  }

  // ───────────────────────────── categories ────────────────────────────
  async categories(vertical: Vertical) {
    const { data, error } = await this.db
      .from("catalog_categories")
      .select("id, vertical_type, parent_id, name, name_ta, image_path, sort, is_active")
      .eq("vertical_type", vertical)
      .order("sort")
      .order("name");
    if (error) throw error;
    return data;
  }

  async createCategory(input: CatalogCategoryInput) {
    const { data, error } = await this.db
      .from("catalog_categories")
      .insert({
        vertical_type: input.verticalType,
        parent_id: input.parentId ?? null,
        name: input.name,
        name_ta: input.nameTa ?? null,
        image_path: input.imagePath ?? null,
        sort: input.sort ?? 0,
        is_active: input.isActive ?? true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateCategory(id: string, input: Partial<CatalogCategoryInput>) {
    const patch: Record<string, unknown> = {};
    if (input.parentId !== undefined) patch.parent_id = input.parentId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.nameTa !== undefined) patch.name_ta = input.nameTa;
    if (input.imagePath !== undefined) patch.image_path = input.imagePath;
    if (input.sort !== undefined) patch.sort = input.sort;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    const { data, error } = await this.db.from("catalog_categories").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Category not found");
    return data;
  }

  // ───────────────────────────── master products ───────────────────────
  async listMaster(opts: { vertical?: Vertical; status?: string; q?: string; categoryId?: string; limit?: number; offset?: number }) {
    const limit = Math.min(opts.limit ?? 50, 200);
    let q = this.db.from("master_products").select(MASTER_COLS, { count: "exact" }).eq("is_active", true);
    if (opts.vertical) q = q.eq("vertical_type", opts.vertical);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
    if (opts.q) {
      const term = opts.q.trim();
      q = /^\d{8,14}$/.test(term) ? q.eq("barcode", term) : q.ilike("name", `%${term}%`);
    }
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(opts.offset ?? 0, (opts.offset ?? 0) + limit - 1);
    if (error) throw error;
    const items = (data ?? []) as Master[];

    // how many shops already list each (bounded by the page)
    const ids = items.map((m) => m.id);
    const listedBy: Record<string, number> = {};
    if (ids.length) {
      const { data: lst } = await this.db.from("store_products").select("master_product_id").in("master_product_id", ids);
      for (const l of lst ?? []) listedBy[l.master_product_id] = (listedBy[l.master_product_id] ?? 0) + 1;
    }
    const ownerIds = [...new Set(items.map((m) => m.owner_dealer_id).filter((v): v is string => !!v))];
    const owners: Record<string, string> = {};
    if (ownerIds.length) {
      const { data: ds } = await this.db.from("dealers").select("id, shop_name").in("id", ownerIds);
      for (const d of ds ?? []) owners[d.id] = d.shop_name;
    }
    return {
      total: count ?? items.length,
      items: items.map((m) => ({ ...m, listed_by: listedBy[m.id] ?? 0, owner_shop: m.owner_dealer_id ? owners[m.owner_dealer_id] ?? null : null })),
    };
  }

  async createMaster(input: MasterProductInput, actor: Actor) {
    if (input.barcode) await this.assertBarcodeFree(input.barcode);
    const { data, error } = await this.db
      .from("master_products")
      .insert({
        vertical_type: input.verticalType ?? "grocery",
        category_id: input.categoryId ?? null,
        barcode: input.barcode ?? null,
        name: input.name,
        name_ta: input.nameTa ?? null,
        brand: input.brand ?? null,
        pack_size: input.packSize ?? null,
        unit: input.unit ?? "piece",
        min_qty: input.minQty ?? (input.unit === "kg" ? 0.25 : 1),
        qty_step: input.qtyStep ?? (input.unit === "kg" ? 0.25 : 1),
        mrp: input.mrp ?? null,
        image_path: input.imagePath ?? null,
        description: input.description ?? null,
        description_ta: input.descriptionTa ?? null,
        scope: "shared",
        status: "approved", // admin-created items are approved by definition
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
      })
      .select(MASTER_COLS)
      .single();
    if (error) throw error;
    return data as Master;
  }

  /** Point a master product at a freshly stored photo (or none); the previous files are removed. */
  async setMasterImage(id: string, stored: { path: string } | null, images: { remove(p: string | null | undefined): Promise<void> }) {
    const { data: row } = await this.db.from("master_products").select("image_path").eq("id", id).maybeSingle();
    if (!row) throw new NotFoundException("Product not found");
    const { error } = await this.db.from("master_products").update({ image_path: stored?.path ?? null }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    if (row.image_path && row.image_path !== stored?.path) await images.remove(row.image_path as string);
    return { id, image_path: stored?.path ?? null };
  }

  async setCategoryImage(id: string, stored: { path: string } | null, images: { remove(p: string | null | undefined): Promise<void> }) {
    const { data: row } = await this.db.from("catalog_categories").select("image_path").eq("id", id).maybeSingle();
    if (!row) throw new NotFoundException("Category not found");
    const { error } = await this.db.from("catalog_categories").update({ image_path: stored?.path ?? null }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    if (row.image_path && row.image_path !== stored?.path) await images.remove(row.image_path as string);
    return { id, image_path: stored?.path ?? null };
  }

  async updateMaster(id: string, input: Partial<MasterProductInput>) {
    const patch: Record<string, unknown> = {};
    if (input.description !== undefined) patch.description = input.description;
    if (input.descriptionTa !== undefined) patch.description_ta = input.descriptionTa;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.barcode !== undefined) {
      if (input.barcode) await this.assertBarcodeFree(input.barcode, id);
      patch.barcode = input.barcode;
    }
    if (input.name !== undefined) patch.name = input.name;
    if (input.nameTa !== undefined) patch.name_ta = input.nameTa;
    if (input.brand !== undefined) patch.brand = input.brand;
    if (input.packSize !== undefined) patch.pack_size = input.packSize;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.minQty !== undefined) patch.min_qty = input.minQty;
    if (input.qtyStep !== undefined) patch.qty_step = input.qtyStep;
    if (input.mrp !== undefined) patch.mrp = input.mrp;
    if (input.imagePath !== undefined) patch.image_path = input.imagePath;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    const { data, error } = await this.db.from("master_products").update(patch).eq("id", id).select(MASTER_COLS).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Product not found");
    // MRP changed: listings above the new MRP would now violate the cap —
    // clamp selling (and shop if needed) so nothing is left unsellable.
    if (input.mrp != null) await this.clampListingsToMrp(id, input.mrp);
    return data as Master;
  }

  /** approve → shared; keep_own → approved, store-only; reject → hidden. */
  async reviewMaster(id: string, action: "approve" | "keep_own" | "reject", note: string | undefined, actor: Actor) {
    const patch = {
      status: action === "reject" ? "rejected" : "approved",
      scope: action === "approve" ? "shared" : action === "keep_own" ? "store" : undefined,
      reviewed_by: actor.id,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    };
    const { data, error } = await this.db
      .from("master_products")
      .update(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
      .eq("id", id)
      .select(MASTER_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Product not found");
    return data as Master;
  }

  async bulkReview(ids: string[], action: "approve" | "reject", actor: Actor) {
    const { error, count } = await this.db
      .from("master_products")
      .update(
        {
          status: action === "reject" ? "rejected" : "approved",
          ...(action === "approve" ? { scope: "shared" } : {}),
          reviewed_by: actor.id,
          reviewed_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .in("id", ids)
      .eq("status", "pending");
    if (error) throw error;
    return { updated: count ?? 0 };
  }

  /** Fold a duplicate into the surviving row: listings move (the target wins
   *  on conflict), import refs re-point, the source is rejected with a note. */
  async mergeMaster(sourceId: string, targetId: string, actor: Actor) {
    if (sourceId === targetId) throw new BadRequestException("Pick a different product to merge into");
    const [{ data: src }, { data: tgt }] = await Promise.all([
      this.db.from("master_products").select("id, barcode, mrp").eq("id", sourceId).maybeSingle(),
      this.db.from("master_products").select("id, barcode, mrp").eq("id", targetId).maybeSingle(),
    ]);
    if (!src || !tgt) throw new NotFoundException("Product not found");

    const { data: srcListings } = await this.db.from("store_products").select(LISTING_COLS).eq("master_product_id", sourceId);
    const { data: tgtListings } = await this.db.from("store_products").select("dealer_id").eq("master_product_id", targetId);
    const already = new Set((tgtListings ?? []).map((l) => l.dealer_id));
    let moved = 0;
    for (const l of (srcListings ?? []) as Listing[]) {
      if (already.has(l.dealer_id)) continue; // the shop already lists the survivor
      const mrp = tgt.mrp ?? l.mrp;
      const selling = mrp != null ? Math.min(l.selling_price, mrp) : l.selling_price;
      const shop = Math.min(l.shop_price, selling);
      const { error } = await this.db.from("store_products").insert({
        dealer_id: l.dealer_id,
        master_product_id: targetId,
        shop_price: shop,
        selling_price: selling,
        mrp,
        price_mode: shop === selling ? "same" : "custom",
        selling_set_by: l.selling_set_by,
        out_of_stock_until: l.out_of_stock_until,
        stock_qty: l.stock_qty,
        is_active: l.is_active,
      });
      if (error) throw error;
      moved++;
    }
    await this.db.from("store_products").delete().eq("master_product_id", sourceId);
    await this.db.from("catalog_import_rows").update({ master_product_id: targetId }).eq("master_product_id", sourceId);
    await this.db.from("catalog_import_rows").update({ suggested_master_product_id: targetId }).eq("suggested_master_product_id", sourceId);
    // the survivor keeps a barcode if only the duplicate had one
    if (!tgt.barcode && src.barcode) {
      await this.db.from("master_products").update({ barcode: null }).eq("id", sourceId);
      await this.db.from("master_products").update({ barcode: src.barcode }).eq("id", targetId);
    }
    await this.db
      .from("master_products")
      .update({ status: "rejected", is_active: false, reviewed_by: actor.id, reviewed_at: new Date().toISOString(), review_note: `merged into ${targetId}` })
      .eq("id", sourceId);
    return { moved };
  }

  private async assertBarcodeFree(barcode: string, exceptId?: string) {
    let q = this.db.from("master_products").select("id, name").eq("barcode", barcode);
    if (exceptId) q = q.neq("id", exceptId);
    const { data } = await q.maybeSingle();
    if (data) throw new ConflictException(`Barcode already belongs to "${data.name}"`);
  }

  private async clampListingsToMrp(masterId: string, mrp: number) {
    const { data } = await this.db.from("store_products").select(LISTING_COLS).eq("master_product_id", masterId);
    for (const l of (data ?? []) as Listing[]) {
      const selling = Math.min(l.selling_price, mrp);
      const shop = Math.min(l.shop_price, selling);
      await this.db
        .from("store_products")
        .update({ mrp, selling_price: selling, shop_price: shop, price_mode: shop === selling ? "same" : l.price_mode })
        .eq("dealer_id", l.dealer_id)
        .eq("master_product_id", masterId);
    }
  }

  // ───────────────────────────── search (shop side) ────────────────────
  /** What a shop may list: shared+approved of its vertical, plus its own items. */
  async searchForDealer(dealerId: string, vertical: Vertical, q: string | undefined, barcode: string | undefined) {
    let query = this.db.from("master_products").select(MASTER_COLS).eq("vertical_type", vertical).eq("is_active", true).neq("status", "rejected");
    if (barcode) query = query.eq("barcode", barcode);
    else if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);
    else return [];
    const { data, error } = await query.or(`and(scope.eq.shared,status.eq.approved),owner_dealer_id.eq.${dealerId}`).limit(25);
    if (error) throw error;
    const items = (data ?? []) as Master[];
    const ids = items.map((m) => m.id);
    const { data: mine } = ids.length
      ? await this.db.from("store_products").select("master_product_id").eq("dealer_id", dealerId).in("master_product_id", ids)
      : { data: [] };
    const listed = new Set((mine ?? []).map((m) => m.master_product_id));
    return items.map((m) => ({ ...m, already_listed: listed.has(m.id) }));
  }

  // ───────────────────────────── listings ──────────────────────────────
  async storeListings(dealerId: string) {
    const { data, error } = await this.db
      .from("store_products")
      .select(`${LISTING_COLS}, master_products(${MASTER_COLS})`)
      .eq("dealer_id", dealerId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const { master_products, ...listing } = row as unknown as Listing & { master_products: Master };
      return { ...listing, product: master_products, platform_margin: money(listing.selling_price - listing.shop_price) };
    });
  }

  /** The invariant, applied before the DB sees it. Returns the prices to store. */
  private resolvePrices(opts: { shop: number; selling?: number; mode?: "same" | "custom"; mrp: number | null; current?: Listing }) {
    const mode = opts.mode ?? opts.current?.price_mode ?? "same";
    const shop = money(opts.shop);
    let selling = mode === "same" ? shop : money(opts.selling ?? opts.current?.selling_price ?? shop);
    if (selling < shop) throw new BadRequestException("Customer price can't be below the shop price — use an offer for discounts");
    if (opts.mrp != null && selling > opts.mrp) throw new BadRequestException(`Customer price can't be above MRP ₹${opts.mrp}`);
    if (opts.mrp != null && shop > opts.mrp) throw new BadRequestException(`Shop price can't be above MRP ₹${opts.mrp}`);
    if (mode === "same") selling = shop;
    return { shop, selling, mode };
  }

  async listProduct(dealerId: string, input: { masterProductId: string; shopPrice: number; sellingPrice?: number; priceMode?: "same" | "custom" }, actor: Actor) {
    const { data: m } = await this.db.from("master_products").select("id, mrp, status, scope, owner_dealer_id, is_active").eq("id", input.masterProductId).maybeSingle();
    if (!m || !m.is_active || m.status === "rejected") throw new NotFoundException("Product not found");
    if (m.scope === "store" && m.owner_dealer_id !== dealerId) throw new NotFoundException("Product not found");
    const { data: existing } = await this.db.from("store_products").select(LISTING_COLS).eq("dealer_id", dealerId).eq("master_product_id", m.id).maybeSingle();
    if (existing) throw new ConflictException("Already on your catalog");
    const p = this.resolvePrices({ shop: input.shopPrice, selling: input.sellingPrice, mode: input.priceMode, mrp: m.mrp });
    const { data, error } = await this.db
      .from("store_products")
      .insert({ dealer_id: dealerId, master_product_id: m.id, shop_price: p.shop, selling_price: p.selling, mrp: m.mrp, price_mode: p.mode })
      .select(LISTING_COLS)
      .single();
    if (error) throw error;
    await this.logPrice(dealerId, m.id, "shop", null, p.shop, actor);
    if (p.selling !== p.shop) await this.logPrice(dealerId, m.id, "sell", null, p.selling, actor);
    return data;
  }

  async patchListing(
    dealerId: string,
    masterId: string,
    input: { shopPrice?: number; sellingPrice?: number; priceMode?: "same" | "custom"; outOfStockUntil?: string | null; stockQty?: number | null; isActive?: boolean },
    actor: Actor,
    asAdmin = false,
  ) {
    const { data: cur } = await this.db.from("store_products").select(LISTING_COLS).eq("dealer_id", dealerId).eq("master_product_id", masterId).maybeSingle();
    if (!cur) throw new NotFoundException("Not on this shop's catalog");
    const current = cur as Listing;
    const patch: Record<string, unknown> = {};
    const touchesPrice = input.shopPrice !== undefined || input.sellingPrice !== undefined || input.priceMode !== undefined;
    if (touchesPrice) {
      if (!asAdmin && current.selling_set_by === "admin" && (input.sellingPrice !== undefined || input.priceMode !== undefined)) {
        throw new BadRequestException("The customer price is set by Thanjoz Mart — you can change your shop price only");
      }
      const shop = input.shopPrice ?? current.shop_price;
      // admin-locked selling stays unless the admin is the one writing
      const lockedSelling = current.selling_set_by === "admin" && !asAdmin ? current.selling_price : input.sellingPrice;
      const mode = current.selling_set_by === "admin" && !asAdmin ? "custom" : input.priceMode;
      const p = this.resolvePrices({ shop, selling: lockedSelling, mode, mrp: current.mrp, current });
      if (p.shop !== current.shop_price) {
        patch.shop_price = p.shop;
        await this.logPrice(dealerId, masterId, "shop", current.shop_price, p.shop, actor);
      }
      if (p.selling !== current.selling_price) {
        patch.selling_price = p.selling;
        await this.logPrice(dealerId, masterId, "sell", current.selling_price, p.selling, actor);
      }
      patch.price_mode = p.mode;
    }
    if (input.outOfStockUntil !== undefined) patch.out_of_stock_until = input.outOfStockUntil;
    if (input.stockQty !== undefined) patch.stock_qty = input.stockQty;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (Object.keys(patch).length === 0) return current;
    const { data, error } = await this.db.from("store_products").update(patch).eq("dealer_id", dealerId).eq("master_product_id", masterId).select(LISTING_COLS).single();
    if (error) throw error;
    return data;
  }

  /** Admin sets the customer price (locks it) or hands it back (null). */
  async adminSetSelling(dealerId: string, masterId: string, sellingPrice: number | null, actor: Actor) {
    const { data: cur } = await this.db.from("store_products").select(LISTING_COLS).eq("dealer_id", dealerId).eq("master_product_id", masterId).maybeSingle();
    if (!cur) throw new NotFoundException("Not on this shop's catalog");
    const current = cur as Listing;
    if (sellingPrice == null) {
      // hand back: selling snaps to the shop's price
      const { data, error } = await this.db
        .from("store_products")
        .update({ selling_price: current.shop_price, price_mode: "same", selling_set_by: "store" })
        .eq("dealer_id", dealerId)
        .eq("master_product_id", masterId)
        .select(LISTING_COLS)
        .single();
      if (error) throw error;
      if (current.selling_price !== current.shop_price) await this.logPrice(dealerId, masterId, "sell", current.selling_price, current.shop_price, actor);
      return data;
    }
    const p = this.resolvePrices({ shop: current.shop_price, selling: sellingPrice, mode: "custom", mrp: current.mrp, current });
    const { data, error } = await this.db
      .from("store_products")
      .update({ selling_price: p.selling, price_mode: p.selling === p.shop ? "same" : "custom", selling_set_by: "admin" })
      .eq("dealer_id", dealerId)
      .eq("master_product_id", masterId)
      .select(LISTING_COLS)
      .single();
    if (error) throw error;
    if (p.selling !== current.selling_price) await this.logPrice(dealerId, masterId, "sell", current.selling_price, p.selling, actor);
    return data;
  }

  /** Shop's own item: pending master row (scope store) + its listing. */
  async createCustom(dealerId: string, vertical: Vertical, input: CustomProductInput, actor: Actor) {
    if (input.barcode) {
      const { data: hit } = await this.db.from("master_products").select("id, name").eq("barcode", input.barcode).maybeSingle();
      if (hit) throw new ConflictException(`That barcode is already "${hit.name}" — list it instead of adding a new item`);
    }
    const { data: m, error } = await this.db
      .from("master_products")
      .insert({
        vertical_type: vertical,
        category_id: input.categoryId ?? null,
        barcode: input.barcode ?? null,
        name: input.name,
        name_ta: input.nameTa ?? null,
        pack_size: input.packSize ?? null,
        unit: input.unit,
        min_qty: input.minQty ?? (input.unit === "kg" ? 0.25 : 1),
        qty_step: input.qtyStep ?? (input.unit === "kg" ? 0.25 : 1),
        mrp: input.mrp ?? null,
        scope: "store",
        status: "pending",
        owner_dealer_id: dealerId,
      })
      .select(MASTER_COLS)
      .single();
    if (error) throw error;
    const listing = await this.listProduct(dealerId, { masterProductId: m.id, shopPrice: input.shopPrice, sellingPrice: input.sellingPrice, priceMode: input.priceMode }, actor);
    return { product: m as Master, listing };
  }

  private async logPrice(dealerId: string, masterId: string, kind: "shop" | "sell", oldPrice: number | null, newPrice: number, actor: Actor) {
    await this.db.from("store_price_history").insert({ dealer_id: dealerId, master_product_id: masterId, kind, old_price: oldPrice, new_price: newPrice, changed_by: actor.id });
  }

  // ───────────────────────────── imports ───────────────────────────────
  async createCsvImport(dealerId: string, vertical: Vertical, csvText: string, actor: Actor) {
    const sheet = parseCsv(csvText);
    const { rows, unmapped } = mapRows(sheet);
    if (!rows.length) throw new BadRequestException("The file has no rows");
    if (unmapped.includes("name")) throw new BadRequestException("Couldn't find an item-name column (expected one of: Item name, Product, Description, Particulars)");

    const { data: imp, error } = await this.db
      .from("catalog_imports")
      .insert({ dealer_id: dealerId, source: "csv", status: "parsing", total_rows: rows.length, created_by: actor.id })
      .select("id")
      .single();
    if (error) throw error;

    // matching: barcode exact → matched; name contains → review with a
    // suggestion; otherwise new. Bad rows are rejected with the reason.
    const barcodes = [...new Set(rows.map((r) => r.barcode).filter((b): b is string => !!b))];
    const byBarcode = new Map<string, Master>();
    for (let i = 0; i < barcodes.length; i += 200) {
      const { data } = await this.db.from("master_products").select(MASTER_COLS).in("barcode", barcodes.slice(i, i + 200)).neq("status", "rejected");
      for (const m of (data ?? []) as Master[]) if (m.barcode) byBarcode.set(m.barcode, m);
    }

    let matched = 0, review = 0, fresh = 0;
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let status: "matched" | "review" | "new" | "rejected" = "new";
      let masterId: string | null = null;
      let suggested: string | null = null;
      let issue: string | null = null;
      if (!r.name) {
        status = "rejected";
        issue = "no item name";
      } else if (r.rate == null) {
        status = "rejected";
        issue = "no rate";
      } else if (r.mrp != null && r.rate > r.mrp) {
        status = "rejected";
        issue = `rate ${r.rate} above MRP ${r.mrp}`;
      } else if (r.barcode && byBarcode.has(r.barcode)) {
        const m = byBarcode.get(r.barcode)!;
        if (m.scope === "store" && m.owner_dealer_id !== dealerId) {
          status = "review"; // someone else's custom item with this barcode — admin decides
          suggested = m.id;
        } else {
          status = "matched";
          masterId = m.id;
        }
      } else {
        const { data: cand } = await this.db
          .from("master_products")
          .select("id")
          .eq("vertical_type", vertical)
          .eq("scope", "shared")
          .neq("status", "rejected")
          .ilike("name", `%${r.name.slice(0, 40)}%`)
          .limit(1)
          .maybeSingle();
        if (cand) {
          status = "review";
          suggested = cand.id;
        }
      }
      if (status === "matched") matched++;
      else if (status === "review") review++;
      else if (status === "new") fresh++;
      out.push({
        import_id: imp.id,
        row_no: i + 1,
        raw: r.raw,
        barcode: r.barcode,
        name: r.name,
        mrp: r.mrp,
        rate: r.rate,
        unit: r.unit,
        match_status: status,
        master_product_id: masterId,
        suggested_master_product_id: suggested,
        issue,
      });
    }
    for (let i = 0; i < out.length; i += 500) {
      const { error: e } = await this.db.from("catalog_import_rows").insert(out.slice(i, i + 500));
      if (e) throw e;
    }
    await this.db.from("catalog_imports").update({ status: "review", matched, needs_review: review, new_items: fresh }).eq("id", imp.id);
    return this.getImport(dealerId, imp.id);
  }

  async listImports(dealerId?: string) {
    let q = this.db
      .from("catalog_imports")
      .select("id, dealer_id, source, status, total_rows, matched, needs_review, new_items, error, created_at, applied_at, dealers(shop_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (dealerId) q = q.eq("dealer_id", dealerId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((i) => ({ ...i, shop: (i.dealers as unknown as { shop_name: string } | null)?.shop_name ?? null, dealers: undefined }));
  }

  async getImport(dealerId: string | undefined, importId: string) {
    let q = this.db.from("catalog_imports").select("*").eq("id", importId);
    if (dealerId) q = q.eq("dealer_id", dealerId);
    const { data: imp } = await q.maybeSingle();
    if (!imp) throw new NotFoundException("Import not found");
    const { data: rows } = await this.db
      .from("catalog_import_rows")
      .select("id, row_no, barcode, name, mrp, rate, unit, match_status, master_product_id, suggested_master_product_id, issue")
      .eq("import_id", importId)
      .order("row_no");
    const refIds = [...new Set((rows ?? []).flatMap((r) => [r.master_product_id, r.suggested_master_product_id]).filter((v): v is string => !!v))];
    const refs: Record<string, { id: string; name: string; pack_size: string | null; mrp: number | null; barcode: string | null }> = {};
    for (let i = 0; i < refIds.length; i += 200) {
      const { data } = await this.db.from("master_products").select("id, name, pack_size, mrp, barcode").in("id", refIds.slice(i, i + 200));
      for (const m of data ?? []) refs[m.id] = m;
    }
    return {
      ...imp,
      rows: (rows ?? []).map((r) => ({
        ...r,
        matched: r.master_product_id ? refs[r.master_product_id] ?? null : null,
        suggestion: r.suggested_master_product_id ? refs[r.suggested_master_product_id] ?? null : null,
      })),
    };
  }

  async decideRow(dealerId: string | undefined, importId: string, rowId: number, action: "confirm" | "new" | "reject", masterProductId?: string) {
    const imp = await this.getImportHeader(dealerId, importId);
    if (imp.status !== "review") throw new BadRequestException("This import is no longer open for review");
    const { data: row } = await this.db.from("catalog_import_rows").select("id, suggested_master_product_id, match_status").eq("id", rowId).eq("import_id", importId).maybeSingle();
    if (!row) throw new NotFoundException("Row not found");
    if (row.match_status === "applied") throw new BadRequestException("Row already applied");
    const patch: Record<string, unknown> =
      action === "confirm"
        ? { match_status: "matched", master_product_id: masterProductId ?? row.suggested_master_product_id, issue: null }
        : action === "new"
          ? { match_status: "new", master_product_id: null, issue: null }
          : { match_status: "rejected", issue: "rejected in review" };
    if (action === "confirm" && !patch.master_product_id) throw new BadRequestException("Pick the product to confirm");
    const { data, error } = await this.db.from("catalog_import_rows").update(patch).eq("id", rowId).select().single();
    if (error) throw error;
    await this.recount(importId);
    return data;
  }

  /** Idempotent: applied rows are skipped; matched → upsert listing, new → pending master + listing. */
  async applyImport(dealerId: string | undefined, importId: string, actor: Actor) {
    const imp = await this.getImportHeader(dealerId, importId);
    if (imp.status !== "review") throw new BadRequestException("Nothing to apply");
    const shop = imp.dealer_id as string;
    const { data: dealer } = await this.db.from("dealers").select("store_type").eq("id", shop).single();
    const vertical = (dealer?.store_type ?? "grocery") as Vertical;
    const { data: rows } = await this.db
      .from("catalog_import_rows")
      .select("id, barcode, name, mrp, rate, unit, match_status, master_product_id")
      .eq("import_id", importId)
      .in("match_status", ["matched", "new"]);
    let listed = 0, updated = 0, created = 0;
    for (const r of rows ?? []) {
      if (r.rate == null) continue;
      let masterId = r.master_product_id as string | null;
      let mrp = r.mrp as number | null;
      if (r.match_status === "new") {
        const { data: m, error } = await this.db
          .from("master_products")
          .insert({
            vertical_type: vertical,
            barcode: r.barcode,
            name: r.name,
            unit: normaliseUnit(r.unit),
            min_qty: normaliseUnit(r.unit) === "kg" ? 0.25 : 1,
            qty_step: normaliseUnit(r.unit) === "kg" ? 0.25 : 1,
            mrp: r.mrp,
            scope: "shared", // a real SKU from a billing export; admin approves into the shared master
            status: "pending",
            owner_dealer_id: shop,
          })
          .select("id")
          .single();
        if (error) {
          await this.db.from("catalog_import_rows").update({ match_status: "rejected", issue: error.message.slice(0, 200) }).eq("id", r.id);
          continue;
        }
        masterId = m.id;
        created++;
      } else {
        const { data: m } = await this.db.from("master_products").select("mrp").eq("id", masterId!).maybeSingle();
        mrp = m?.mrp ?? r.mrp;
      }
      const shopPrice = money(Math.min(r.rate as number, mrp ?? Number.POSITIVE_INFINITY));
      const { data: existing } = await this.db.from("store_products").select(LISTING_COLS).eq("dealer_id", shop).eq("master_product_id", masterId!).maybeSingle();
      if (existing) {
        const cur = existing as Listing;
        const selling = cur.selling_set_by === "admin" ? Math.max(cur.selling_price, shopPrice) : cur.price_mode === "same" ? shopPrice : Math.max(cur.selling_price, shopPrice);
        await this.db
          .from("store_products")
          .update({ shop_price: shopPrice, selling_price: mrp != null ? Math.min(selling, mrp) : selling, mrp })
          .eq("dealer_id", shop)
          .eq("master_product_id", masterId!);
        if (cur.shop_price !== shopPrice) await this.logPrice(shop, masterId!, "shop", cur.shop_price, shopPrice, actor);
        updated++;
      } else {
        const { error } = await this.db.from("store_products").insert({ dealer_id: shop, master_product_id: masterId!, shop_price: shopPrice, selling_price: shopPrice, mrp, price_mode: "same" });
        if (error) {
          await this.db.from("catalog_import_rows").update({ match_status: "rejected", issue: error.message.slice(0, 200) }).eq("id", r.id);
          continue;
        }
        await this.logPrice(shop, masterId!, "shop", null, shopPrice, actor);
        listed++;
      }
      await this.db.from("catalog_import_rows").update({ match_status: "applied", master_product_id: masterId }).eq("id", r.id);
    }
    await this.db.from("catalog_imports").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", importId);
    return { listed, updated, created_pending: created };
  }

  private async getImportHeader(dealerId: string | undefined, importId: string) {
    let q = this.db.from("catalog_imports").select("id, dealer_id, status").eq("id", importId);
    if (dealerId) q = q.eq("dealer_id", dealerId);
    const { data } = await q.maybeSingle();
    if (!data) throw new NotFoundException("Import not found");
    return data;
  }

  private async recount(importId: string) {
    const { data } = await this.db.from("catalog_import_rows").select("match_status").eq("import_id", importId);
    const c = { matched: 0, review: 0, new: 0 };
    for (const r of data ?? []) if (r.match_status in c) c[r.match_status as keyof typeof c]++;
    await this.db.from("catalog_imports").update({ matched: c.matched, needs_review: c.review, new_items: c.new }).eq("id", importId);
  }

  // ───────────────────────────── shop type ─────────────────────────────
  async setStoreType(dealerId: string, storeType: Vertical) {
    const { data, error } = await this.db.from("dealers").update({ store_type: storeType }).eq("id", dealerId).select("id, shop_name, store_type").maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Shop not found");
    return data;
  }
}
