import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { offerQuoteSchema } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";
import { OffersService } from "./offers.service";

/** Customer-facing offers: what's live, and what a cart would save. */
@Controller("offers")
export class OffersController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly offers: OffersService,
  ) {}

  /** GET /offers?pincode= — live banner offers and coupons for the home screen and price tags. */
  @Get()
  async live(@Headers("authorization") auth: string | undefined, @Query("pincode") pincode?: string) {
    const user = await requireUser(this.supabase, auth);
    return this.offers.publicList(user.id, pincode);
  }

  /** POST /offers/quote — best discount for this cart (with an optional coupon). A preview; the order re-checks. */
  @Post("quote")
  async quote(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const r = offerQuoteSchema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return this.offers.quote(user.id, r.data.items, r.data.couponCode, r.data.pincode);
  }
}
