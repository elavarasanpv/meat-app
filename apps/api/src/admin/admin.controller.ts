import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { adminHeadlineSchema, adminOfferSchema, ticketResolveSchema, ticketReplySchema, adminInviteSchema, adminProfileSchema, adminCancelSchema, adminCashVerifySchema, adminReassignShopSchema, adminRiderSchema, adminShopSchema, adminBroadcastSchema, adminSellPriceSchema, adminShopPriceSchema, adminMarginSchema, deliveryRuleSchema, deliveryFirstFreeSchema, deliveryTestSchema } from "@thanjozmart/shared";
import type { ZodTypeAny, z } from "zod";
import { AdminOpsService } from "./admin-ops.service";
import { AdminAccountService } from "./admin-account.service";
import { DeliverySettingsService } from "./delivery-settings.service";
import { SupportService } from "../support/support.service";
import { OffersService } from "../offers/offers.service";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import { requireAdmin } from "./admin.guard";
import { ImagesService } from "../images/images.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly admin: AdminService,
    private readonly ops: AdminOpsService,
    private readonly account: AdminAccountService,
    private readonly support: SupportService,
    private readonly offersSvc: OffersService,
    private readonly images: ImagesService,
    private readonly delivery: DeliverySettingsService,
  ) {}

  private guard(auth: string | undefined) {
    return requireAdmin(this.supabase, auth);
  }

  /** GET /admin/dashboard — today's numbers, 7-day series, recent orders, who's on duty. */
  @Get("dashboard")
  async dashboard(@Headers("authorization") auth: string | undefined) {
    await requireAdmin(this.supabase, auth);
    return this.admin.dashboard();
  }

  /** GET /admin/ratings — stars for the app, riders and products, plus written feedback. */
  @Get("ratings")
  async ratings(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.ratings();
  }

  /** GET /admin/me — 200 with the admin's identity, or 403 for everyone else. */
  @Get("me")
  async me(@Headers("authorization") auth: string | undefined) {
    const user = await requireAdmin(this.supabase, auth);
    return this.admin.me(user.id, user.email);
  }

  // ── orders ──
  @Get("orders")
  async orders(@Headers("authorization") auth: string | undefined, @Query("filter") filter?: string, @Query("q") q?: string) {
    await this.guard(auth);
    return this.ops.listOrders(filter, q);
  }

  @Get("orders/:id")
  async order(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.ops.orderDetail(id);
  }

  @Post("orders/:id/cancel")
  async cancel(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.cancelOrder(a, id, parse(adminCancelSchema, body).reason);
  }

  @Post("orders/:id/reassign-shop")
  async reassign(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.reassignShop(a, id, parse(adminReassignShopSchema, body ?? {}).dealerId);
  }

  @Post("orders/:id/release-rider")
  async release(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const a = await this.guard(auth);
    return this.ops.releaseRider(a, id);
  }

  // ── catalogue ──
  @Get("catalog")
  async catalog(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.catalog();
  }

  // ── shops ──
  @Get("shops")
  async shops(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.listShops();
  }

  @Get("shops/:id/stats")
  async shopStats(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.ops.shopStats(id);
  }

  @Get("shops/:id")
  async shop(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.ops.shopDetail(id);
  }

  @Post("shops")
  async enrolShop(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.saveShop(a, parse(adminShopSchema, body));
  }

  @Patch("shops/:id")
  async updateShop(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.saveShop(a, parse(adminShopSchema, body), id);
  }

  // ── riders ──
  @Get("riders")
  async riders(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.listRiders();
  }

  @Get("riders/:id/stats")
  async riderStats(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.ops.riderStats(id);
  }

  @Get("riders/:id/live")
  async riderLive(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.ops.riderLive(id);
  }

  @Post("riders")
  async enrolRider(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.saveRider(a, parse(adminRiderSchema, body));
  }

  @Patch("riders/:id")
  async updateRider(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.saveRider(a, parse(adminRiderSchema, body), id);
  }

  // ── cash ──
  @Get("cash")
  async cash(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.cash();
  }

  @Post("cash/:id/verify")
  async verifyCash(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminCashVerifySchema, body);
    return this.ops.verifyCash(a, id, v.received, v.note);
  }

  // ── offers & coupons ──
  @Get("offers")
  async offersList(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.offersSvc.adminList();
  }

  @Post("offers")
  async offerCreate(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminOfferSchema, body);
    const r = await this.offersSvc.save(a.id, v);
    await this.admin.log(a.id, "offer.create", r.id, { title: v.title, kind: v.kind, code: v.code, discount: `${v.discountValue}${v.discountType === "percent" ? "%" : "₹"}` });
    return r;
  }

  @Patch("offers/:id")
  async offerUpdate(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminOfferSchema, body);
    const r = await this.offersSvc.save(a.id, v, id);
    await this.admin.log(a.id, "offer.update", id, { title: v.title, code: v.code });
    return r;
  }

  @Post("offers/:id/active")
  async offerActive(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: { active?: boolean }) {
    const a = await this.guard(auth);
    const r = await this.offersSvc.setActive(id, !!body?.active);
    await this.admin.log(a.id, body?.active ? "offer.resume" : "offer.pause", id);
    return r;
  }

  // ── pricing ──
  /** POST /admin/products/:id/image — a meat product's photo (resized to WebP). DELETE clears it. */
  @Post("products/:id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 6_000_000 } }))
  async productImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @UploadedFile() file: { buffer: Buffer; mimetype?: string; size: number } | undefined) {
    await this.guard(auth);
    return this.setProductImage(id, file ? await this.images.store("product", id, file) : null);
  }

  @Delete("products/:id/image")
  async clearProductImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.setProductImage(id, null);
  }

  private async setProductImage(id: string, stored: { path: string } | null) {
    const db = this.supabase.admin;
    const { data: row } = await db.from("products").select("image_path").eq("id", id).maybeSingle();
    if (!row) throw new BadRequestException("Product not found");
    const { error } = await db.from("products").update({ image_path: stored?.path ?? null }).eq("id", id);
    if (error) throw new BadRequestException(error.message);
    // Only files we stored (kind/id/stamp.webp) are deleted; bundled-style paths from the seed stay.
    if (row.image_path && row.image_path !== stored?.path && /^product\//.test(row.image_path as string)) await this.images.remove(row.image_path as string);
    return { id, image_path: stored?.path ?? null };
  }

  @Get("pricing")
  async pricing(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.pricing();
  }

  @Post("pricing/sell")
  async sellPrice(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.setSellPrice(a.id, parse(adminSellPriceSchema, body));
  }

  @Post("pricing/shop")
  async shopPrice(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.setShopPrice(a.id, parse(adminShopPriceSchema, body));
  }

  @Post("pricing/margin")
  async margin(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.setMargin(a.id, parse(adminMarginSchema, body));
  }

  @Get("pricing/history")
  async priceHistory(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.priceHistory();
  }

  // ── promo pushes ──
  @Get("broadcasts")
  async broadcasts(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.ops.broadcasts();
  }

  @Post("broadcasts")
  async broadcast(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.ops.broadcast(a.id, parse(adminBroadcastSchema, body));
  }

  // ── home headline ──
  @Get("headlines")
  async headlines(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.offersSvc.adminHeadlines();
  }

  @Post("headlines")
  async headlineCreate(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminHeadlineSchema, body);
    const r = await this.offersSvc.saveHeadline(a.id, v);
    await this.admin.log(a.id, "headline.create", r.id, { title: v.title });
    return r;
  }

  @Patch("headlines/:id")
  async headlineUpdate(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminHeadlineSchema, body);
    const r = await this.offersSvc.saveHeadline(a.id, v, id);
    await this.admin.log(a.id, "headline.update", id, { title: v.title });
    return r;
  }

  @Post("headlines/:id/active")
  async headlineActive(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: { active?: boolean }) {
    const a = await this.guard(auth);
    const r = await this.offersSvc.setHeadlineActive(id, !!body?.active);
    await this.admin.log(a.id, body?.active ? "headline.resume" : "headline.pause", id);
    return r;
  }

  // ── support ──
  @Get("support")
  async supportList(@Headers("authorization") auth: string | undefined, @Query("filter") filter?: string) {
    await this.guard(auth);
    return this.support.adminList(filter);
  }

  @Get("support/:id")
  async supportThread(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    const ticket = await this.support.thread(null, id);
    const order = ticket.orderId ? await this.ops.orderDetail(ticket.orderId).catch(() => null) : null;
    return { ...ticket, orderDetail: order };
  }

  @Post("support/:id/reply")
  async supportReply(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.support.adminReply(a, id, parse(ticketReplySchema, body).body);
  }

  @Post("support/:id/resolve")
  async supportResolve(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(ticketResolveSchema, body);
    const r = await this.support.resolve(a, id, v);
    await this.admin.log(a.id, "support.resolve", id, { ...v });
    return r;
  }

  @Post("support/:id/close")
  async supportClose(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const a = await this.guard(auth);
    const r = await this.support.close(a, id);
    await this.admin.log(a.id, "support.close", id);
    return r;
  }

  // ── alerts, account, team, activity ──
  @Get("notifications")
  async notifications(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.account.notifications();
  }

  @Patch("me")
  async updateMe(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.account.updateMe(a, parse(adminProfileSchema, body).name);
  }

  @Get("admins")
  async admins(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.account.admins();
  }

  @Post("admins")
  async invite(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(adminInviteSchema, body);
    return this.account.invite(a, v.email, v.note, v.appUrl);
  }

  @Delete("admins/:email")
  async removeAdmin(@Headers("authorization") auth: string | undefined, @Param("email") email: string) {
    const a = await this.guard(auth);
    return this.account.remove(a, decodeURIComponent(email).toLowerCase());
  }

  @Get("activity")
  async activity(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.account.activity();
  }

  @Get("rules")
  async rules(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.account.rules();
  }

  // ── delivery settings: minimum order, fee, free-from amount, by vertical and pincode ──

  /** GET /admin/delivery — every vertical with its default rule, pincode rules and first-order switch. */
  @Get("delivery")
  async deliverySettings(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.delivery.get();
  }

  @Post("delivery/rules")
  async createDeliveryRule(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(deliveryRuleSchema, body);
    const r = await this.delivery.saveRule(a.id, undefined, v);
    await this.admin.log(a.id, "delivery.rule.create", r.id, { vertical: r.verticalType, pincode: r.pincode ?? "all", minOrder: r.minOrder, fee: r.fee, freeAbove: r.freeAbove });
    return r;
  }

  @Patch("delivery/rules/:id")
  async updateDeliveryRule(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(deliveryRuleSchema, body);
    const r = await this.delivery.saveRule(a.id, id, v);
    await this.admin.log(a.id, "delivery.rule.update", id, { vertical: r.verticalType, pincode: r.pincode ?? "all", minOrder: r.minOrder, fee: r.fee, freeAbove: r.freeAbove, active: r.isActive });
    return r;
  }

  @Delete("delivery/rules/:id")
  async deleteDeliveryRule(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const a = await this.guard(auth);
    const r = await this.delivery.deleteRule(id);
    await this.admin.log(a.id, "delivery.rule.delete", id, { vertical: r.verticalType, pincode: r.pincode });
    return { ok: true };
  }

  /** PATCH /admin/delivery/first-order — free delivery on a customer's first order, per vertical. */
  @Patch("delivery/first-order")
  async deliveryFirstOrder(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const v = parse(deliveryFirstFreeSchema, body);
    const r = await this.delivery.setFirstOrderFree(v.verticalType, v.on);
    await this.admin.log(a.id, v.on ? "delivery.first_free.on" : "delivery.first_free.off", v.verticalType);
    return r;
  }

  /** POST /admin/delivery/test — what a basket pays at a pincode, and which rule decided it. Changes nothing. */
  @Post("delivery/test")
  async deliveryTest(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    await this.guard(auth);
    return this.delivery.test(parse(deliveryTestSchema, body));
  }
}

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
}
