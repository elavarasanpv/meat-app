import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ZodTypeAny, z } from "zod";
import { customProductSchema, importRowDecisionSchema, ownProductPatchSchema, storeListingPatchSchema, storeListingSchema } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";
import { ImagesService } from "../images/images.service";
import { CatalogService } from "./catalog.service";

type Upload = { buffer: Buffer; originalname?: string; mimetype?: string; size: number };

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** The shop's side of its own catalog. Every route resolves the caller's
 *  dealer row first, so a shop can only ever touch its own listings. */
@Controller("dealer/catalog")
export class CatalogDealerController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly catalog: CatalogService,
    private readonly images: ImagesService,
  ) {}

  /** Same rule as DealerService.resolveDealer (active shop owned by the caller),
   *  inlined so this module doesn't pull in the whole dealer/orders graph. */
  private async shop(auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    const { data } = await this.supabase.admin.from("dealers").select("id, store_type").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (!data) throw new ForbiddenException("Not a dealer");
    return { user, dealerId: data.id as string, vertical: (data.store_type ?? "meat") as "meat" | "grocery" };
  }

  /** GET /dealer/catalog — my listings with the three prices and stock. */
  @Get()
  async mine(@Headers("authorization") auth: string | undefined) {
    const s = await this.shop(auth);
    return this.catalog.storeListings(s.dealerId);
  }

  /** GET /dealer/catalog/search?q=|barcode= — what I can list (shared + my own). */
  @Get("search")
  async search(@Headers("authorization") auth: string | undefined, @Query("q") q?: string, @Query("barcode") barcode?: string) {
    const s = await this.shop(auth);
    return this.catalog.searchForDealer(s.dealerId, s.vertical, q, barcode);
  }

  /** GET /dealer/catalog/categories — the category tree to file a product under. */
  @Get("categories")
  async categories(@Headers("authorization") auth: string | undefined) {
    const s = await this.shop(auth);
    return (await this.catalog.categories(s.vertical)).filter((c) => c.is_active);
  }

  /** PATCH /dealer/catalog/:masterId/product — details, MRP and prices of an item I added myself. */
  @Patch(":masterId/product")
  async patchOwn(@Headers("authorization") auth: string | undefined, @Param("masterId") masterId: string, @Body() body: unknown) {
    const s = await this.shop(auth);
    return this.catalog.updateOwnProduct(s.dealerId, masterId, parse(ownProductPatchSchema, body), s.user);
  }

  /** POST /dealer/catalog/:masterId/image — photo of an item I added myself. The app sends it under 1 MB. */
  @Post(":masterId/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_000_000 } }))
  async ownImage(@Headers("authorization") auth: string | undefined, @Param("masterId") masterId: string, @UploadedFile() file: Upload | undefined) {
    const s = await this.shop(auth);
    if (!file?.buffer?.length) throw new BadRequestException("No file");
    await this.catalog.assertOwned(s.dealerId, masterId);
    return this.catalog.setOwnImage(s.dealerId, masterId, await this.images.store("master", masterId, file), this.images);
  }

  @Delete(":masterId/image")
  async clearOwnImage(@Headers("authorization") auth: string | undefined, @Param("masterId") masterId: string) {
    const s = await this.shop(auth);
    return this.catalog.setOwnImage(s.dealerId, masterId, null, this.images);
  }

  /** POST /dealer/catalog/list — list a master product at my price. */
  @Post("list")
  async list(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const s = await this.shop(auth);
    return this.catalog.listProduct(s.dealerId, parse(storeListingSchema, body), s.user);
  }

  /** POST /dealer/catalog/custom — my own item (pending for admin) + listing. */
  @Post("custom")
  async custom(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const s = await this.shop(auth);
    return this.catalog.createCustom(s.dealerId, s.vertical, parse(customProductSchema, body), s.user);
  }

  /** PATCH /dealer/catalog/:masterId — price / stock / active. Admin-locked selling is refused. */
  @Patch(":masterId")
  async patch(@Headers("authorization") auth: string | undefined, @Param("masterId") masterId: string, @Body() body: unknown) {
    const s = await this.shop(auth);
    return this.catalog.patchListing(s.dealerId, masterId, parse(storeListingPatchSchema, body), s.user, false);
  }

  // ── imports ──
  @Get("imports")
  async imports(@Headers("authorization") auth: string | undefined) {
    const s = await this.shop(auth);
    return this.catalog.listImports(s.dealerId);
  }

  @Post("imports")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  async createImport(@Headers("authorization") auth: string | undefined, @UploadedFile() file: Upload | undefined) {
    const s = await this.shop(auth);
    if (!file?.buffer?.length) throw new BadRequestException("No file");
    return this.catalog.createCsvImport(s.dealerId, s.vertical, file.buffer.toString("utf8"), s.user);
  }

  @Get("imports/:id")
  async importDetail(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const s = await this.shop(auth);
    return this.catalog.getImport(s.dealerId, id);
  }

  @Post("imports/:id/rows/:rowId")
  async decideRow(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Param("rowId") rowId: string, @Body() body: unknown) {
    const s = await this.shop(auth);
    const input = parse(importRowDecisionSchema, body);
    return this.catalog.decideRow(s.dealerId, id, Number(rowId), input.action, input.masterProductId);
  }

  @Post("imports/:id/apply")
  async apply(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const s = await this.shop(auth);
    return this.catalog.applyImport(s.dealerId, id, s.user);
  }
}
