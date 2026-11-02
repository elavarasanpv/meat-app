import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { adminCancelSchema, adminCashVerifySchema, adminReassignShopSchema, adminRiderSchema, adminShopSchema } from "@freshcut/shared";
import type { ZodTypeAny, z } from "zod";
import { AdminOpsService } from "./admin-ops.service";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import { requireAdmin } from "./admin.guard";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly admin: AdminService,
    private readonly ops: AdminOpsService,
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
}

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
}
