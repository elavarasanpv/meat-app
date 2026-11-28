import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { shopOfferReviewSchema, shopOfferSchema } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";
import { requireAdmin } from "../admin/admin.guard";
import { GroceryOffersService } from "./grocery-offers.service";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

type Upload = { buffer: Buffer; mimetype?: string; size: number } | undefined;
const activeBody = z.object({ active: z.boolean() });
const quoteBody = z.object({
  addressId: z.string().uuid(),
  items: z.array(z.object({ masterProductId: z.string().uuid(), qty: z.coerce.number().int().min(1).max(99) })).max(100),
});

/** The shop's own offers (grocery shops). */
@Controller("dealer/offers")
export class ShopOffersController {
  constructor(
    private readonly offers: GroceryOffersService,
    private readonly supabase: SupabaseService,
  ) {}

  private async dealer(auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return { user, dealerId: await this.offers.dealerOf(user.id) };
  }

  @Get()
  async list(@Headers("authorization") auth: string | undefined) {
    const { dealerId } = await this.dealer(auth);
    return this.offers.listForShop(dealerId);
  }

  /** POST /dealer/offers — a new offer; it waits for the admin. */
  @Post()
  async create(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const { user, dealerId } = await this.dealer(auth);
    return this.offers.saveForShop(dealerId, user.id, parse(shopOfferSchema, body));
  }

  /** POST /dealer/offers/:id — change it; it waits for the admin again. */
  @Post(":id")
  async update(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const { user, dealerId } = await this.dealer(auth);
    return this.offers.saveForShop(dealerId, user.id, parse(shopOfferSchema, body), id);
  }

  @Post(":id/active")
  async active(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const { dealerId } = await this.dealer(auth);
    return this.offers.setActive(id, parse(activeBody, body).active, dealerId);
  }

  @Post(":id/end")
  async end(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string) {
    const { dealerId } = await this.dealer(auth);
    return this.offers.end(id, dealerId);
  }

  /** POST /dealer/offers/:id/image — the offer's own banner picture. DELETE goes back to the product photo. */
  @Post(":id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 6_000_000 } }))
  async image(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @UploadedFile() file: Upload) {
    const { dealerId } = await this.dealer(auth);
    if (!file) throw new BadRequestException("Choose a picture");
    return this.offers.setBanner(id, file, dealerId);
  }

  @Delete(":id/image")
  async removeImage(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string) {
    const { dealerId } = await this.dealer(auth);
    return this.offers.setBanner(id, null, dealerId);
  }
}

/** The admin reviews shop offers and can make one for a shop. */
@Controller("admin/shop-offers")
export class AdminShopOffersController {
  constructor(
    private readonly offers: GroceryOffersService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  async list(@Headers("authorization") auth: string | undefined) {
    await requireAdmin(this.supabase, auth);
    return this.offers.adminList();
  }

  @Post()
  async create(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const admin = await requireAdmin(this.supabase, auth);
    return this.offers.adminSave(admin.id, parse(shopOfferSchema, body));
  }

  @Post(":id")
  async update(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const admin = await requireAdmin(this.supabase, auth);
    return this.offers.adminSave(admin.id, parse(shopOfferSchema, body), id);
  }

  @Post(":id/review")
  async review(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const admin = await requireAdmin(this.supabase, auth);
    const input = parse(shopOfferReviewSchema, body);
    return this.offers.review(admin.id, id, input.approve, input.reason);
  }

  @Post(":id/active")
  async active(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    await requireAdmin(this.supabase, auth);
    return this.offers.setActive(id, parse(activeBody, body).active);
  }

  @Post(":id/end")
  async end(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string) {
    await requireAdmin(this.supabase, auth);
    return this.offers.end(id);
  }

  @Post(":id/image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 6_000_000 } }))
  async image(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string, @UploadedFile() file: Upload) {
    await requireAdmin(this.supabase, auth);
    if (!file) throw new BadRequestException("Choose a picture");
    return this.offers.setBanner(id, file);
  }

  @Delete(":id/image")
  async removeImage(@Headers("authorization") auth: string | undefined, @Param("id", new ParseUUIDPipe()) id: string) {
    await requireAdmin(this.supabase, auth);
    return this.offers.setBanner(id, null);
  }
}

/** What offers do to the customer's grocery basket. */
@Controller("grocery/offers")
export class CustomerGroceryOffersController {
  constructor(
    private readonly offers: GroceryOffersService,
    private readonly supabase: SupabaseService,
  ) {}

  /** POST /grocery/offers/quote — free items, coupon and hints for this basket at this address. */
  @Post("quote")
  async quote(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const input = parse(quoteBody, body);
    return this.offers.quote(user.id, input.addressId, input.items);
  }

  /** GET /grocery/offers/coupons — next-order coupons the customer holds. */
  @Get("coupons")
  async coupons(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.offers.myCoupons(user.id);
  }
}
