import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { adminInviteSchema, adminProfileSchema, adminCancelSchema, adminCashVerifySchema, adminReassignShopSchema, adminRiderSchema, adminShopSchema } from "@freshcut/shared";
import type { ZodTypeAny, z } from "zod";
import { AdminOpsService } from "./admin-ops.service";
import { AdminAccountService } from "./admin-account.service";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import { requireAdmin } from "./admin.guard";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly admin: AdminService,
    private readonly ops: AdminOpsService,
    private readonly account: AdminAccountService,
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
}

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
}
