import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ZodTypeAny, z } from "zod";
import {
  adminStoreSellingSchema,
  adminStoreTypeSchema,
  catalogCategorySchema,
  importRowDecisionSchema,
  masterBulkReviewSchema,
  masterMergeSchema,
  masterProductSchema,
  masterReviewSchema,
  storeListingPatchSchema,
  storeListingSchema,
  verticalToggleSchema,
} from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { requireAdmin } from "../admin/admin.guard";
import { ImagesService } from "../images/images.service";
import { CatalogService } from "./catalog.service";

type Upload = { buffer: Buffer; originalname?: string; mimetype?: string; size: number };

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** Admin side of the grocery catalog: categories, master + approval queue,
 *  a shop's listings (incl. the selling-price lock), imports. */
@Controller("admin/catalog")
export class CatalogAdminController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly catalog: CatalogService,
    private readonly images: ImagesService,
  ) {}

  private guard(auth: string | undefined) {
    return requireAdmin(this.supabase, auth);
  }

  // ── verticals ──
  @Get("verticals")
  async verticals(@Headers("authorization") auth: string | undefined) {
    await this.guard(auth);
    return this.catalog.verticals();
  }

  @Patch("verticals/:type")
  async toggleVertical(@Headers("authorization") auth: string | undefined, @Param("type") type: string, @Body() body: unknown) {
    await this.guard(auth);
    return this.catalog.setVertical(type, parse(verticalToggleSchema, body).isActive);
  }

  // ── categories ──
  @Get("categories")
  async categories(@Headers("authorization") auth: string | undefined, @Query("vertical") vertical?: string) {
    await this.guard(auth);
    return this.catalog.categories((vertical as "meat" | "grocery") ?? "grocery");
  }

  @Post("categories")
  async createCategory(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    await this.guard(auth);
    return this.catalog.createCategory(parse(catalogCategorySchema, body));
  }

  @Patch("categories/:id")
  async updateCategory(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    await this.guard(auth);
    return this.catalog.updateCategory(id, parse(catalogCategorySchema.partial(), body));
  }

  // ── master ──
  @Post("categories/:id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 6_000_000 } }))
  async categoryImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @UploadedFile() file: Upload | undefined) {
    await this.guard(auth);
    return this.catalog.setCategoryImage(id, file ? await this.images.store("catalog_category", id, file) : null, this.images);
  }

  @Delete("categories/:id/image")
  async clearCategoryImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.catalog.setCategoryImage(id, null, this.images);
  }

  @Get("master")
  async master(
    @Headers("authorization") auth: string | undefined,
    @Query("vertical") vertical?: string,
    @Query("status") status?: string,
    @Query("q") q?: string,
    @Query("category") categoryId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    await this.guard(auth);
    return this.catalog.listMaster({
      vertical: vertical as "meat" | "grocery" | undefined,
      status,
      q,
      categoryId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post("master")
  async createMaster(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.catalog.createMaster(parse(masterProductSchema, body), a);
  }

  @Patch("master/:id")
  async updateMaster(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    await this.guard(auth);
    return this.catalog.updateMaster(id, parse(masterProductSchema.partial(), body));
  }

  /** Upload (replace) a master product's photo; resized to WebP, stored in product-images. */
  @Post("master/:id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 6_000_000 } }))
  async masterImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @UploadedFile() file: Upload | undefined) {
    await this.guard(auth);
    return this.catalog.setMasterImage(id, file ? await this.images.store("master", id, file) : null, this.images);
  }

  @Delete("master/:id/image")
  async clearMasterImage(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.catalog.setMasterImage(id, null, this.images);
  }

  @Post("master/:id/review")
  async review(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    const input = parse(masterReviewSchema, body);
    return this.catalog.reviewMaster(id, input.action, input.note, a);
  }

  @Post("master/bulk-review")
  async bulkReview(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const a = await this.guard(auth);
    const input = parse(masterBulkReviewSchema, body);
    return this.catalog.bulkReview(input.ids, input.action, a);
  }

  @Post("master/:id/merge")
  async merge(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.catalog.mergeMaster(id, parse(masterMergeSchema, body).targetId, a);
  }

  // ── a shop's listings ──
  @Get("stores/:dealerId/products")
  async storeProducts(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string) {
    await this.guard(auth);
    return this.catalog.storeListings(dealerId);
  }

  /** List a master product for a shop, with prices the owner gave the admin. */
  @Post("stores/:dealerId/products")
  async addStoreProduct(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.catalog.listProduct(dealerId, parse(storeListingSchema, body), a);
  }

  @Patch("stores/:dealerId/products/:masterId")
  async patchStoreProduct(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string, @Param("masterId") masterId: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.catalog.patchListing(dealerId, masterId, parse(storeListingPatchSchema, body), a, true);
  }

  /** Lock the customer price (or hand it back with sellingPrice: null). */
  @Post("stores/:dealerId/products/:masterId/selling")
  async setSelling(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string, @Param("masterId") masterId: string, @Body() body: unknown) {
    const a = await this.guard(auth);
    return this.catalog.adminSetSelling(dealerId, masterId, parse(adminStoreSellingSchema, body).sellingPrice, a);
  }

  @Patch("stores/:dealerId/type")
  async setStoreType(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string, @Body() body: unknown) {
    await this.guard(auth);
    return this.catalog.setStoreType(dealerId, parse(adminStoreTypeSchema, body).storeType);
  }

  // ── imports (admin can run one on a shop's behalf) ──
  @Get("imports")
  async imports(@Headers("authorization") auth: string | undefined, @Query("dealer") dealerId?: string) {
    await this.guard(auth);
    return this.catalog.listImports(dealerId);
  }

  @Get("imports/:id")
  async importDetail(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.guard(auth);
    return this.catalog.getImport(undefined, id);
  }

  @Post("stores/:dealerId/imports")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  async createImport(@Headers("authorization") auth: string | undefined, @Param("dealerId") dealerId: string, @UploadedFile() file: Upload | undefined) {
    const a = await this.guard(auth);
    if (!file?.buffer?.length) throw new BadRequestException("No file");
    const { data: dealer } = await this.supabase.admin.from("dealers").select("store_type").eq("id", dealerId).maybeSingle();
    if (!dealer) throw new BadRequestException("Shop not found");
    return this.catalog.createCsvImport(dealerId, dealer.store_type as "meat" | "grocery", file.buffer.toString("utf8"), a);
  }

  @Post("imports/:id/rows/:rowId")
  async decideRow(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Param("rowId") rowId: string, @Body() body: unknown) {
    await this.guard(auth);
    const input = parse(importRowDecisionSchema, body);
    return this.catalog.decideRow(undefined, id, Number(rowId), input.action, input.masterProductId);
  }

  @Post("imports/:id/apply")
  async applyImport(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const a = await this.guard(auth);
    return this.catalog.applyImport(undefined, id, a);
  }
}
