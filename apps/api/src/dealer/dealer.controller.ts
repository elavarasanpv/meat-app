import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { dealerAcceptSchema, dealerRejectSchema, itemPhotoSchema, itemUnavailableSchema, shopStateSchema, stockSchema, weighItemSchema } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";
import { DealerService } from "./dealer.service";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

@Controller("dealer")
export class DealerController {
  constructor(
    private readonly dealer: DealerService,
    private readonly supabase: SupabaseService,
  ) {}

  /** GET /dealer/me — the caller's shop. */
  @Get("me")
  async me(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.resolveDealer(user.id);
  }

  /** GET /dealer/orders — open orders for this shop, at shop prices. */
  @Get("orders")
  async orders(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    const dealer = await this.dealer.resolveDealer(user.id);
    return this.dealer.listOrders(dealer.id);
  }

  /** GET /dealer/summary — counts per stage + today's sales. */
  @Get("summary")
  async summary(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    const dealer = await this.dealer.resolveDealer(user.id);
    return this.dealer.summary(dealer.id);
  }

  /** GET /dealer/history — finished orders, newest first. */
  @Get("history")
  async history(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    const dealer = await this.dealer.resolveDealer(user.id);
    return this.dealer.history(dealer.id);
  }

  /** POST /dealer/orders/accept { orderId, readyMinutes } */
  @Post("orders/accept")
  async accept(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.accept(user.id, parse(dealerAcceptSchema, body));
  }

  /** POST /dealer/orders/reject { orderId, reason, note? } */
  @Post("orders/reject")
  async reject(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.reject(user.id, parse(dealerRejectSchema, body));
  }

  /** POST /dealer/orders/item-unavailable { orderId, orderItemId } */
  @Post("orders/item-unavailable")
  async itemUnavailable(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.itemUnavailable(user.id, parse(itemUnavailableSchema, body));
  }

  /** POST /dealer/orders/:id/start-cutting */
  @Post("orders/:id/start-cutting")
  async startCutting(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.startCutting(user.id, id);
  }

  /** POST /dealer/orders/weigh { orderId, orderItemId, actualQty, photoPath? } */
  @Post("orders/weigh")
  async weigh(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.weighItem(user.id, parse(weighItemSchema, body));
  }

  /** POST /dealer/orders/item-photo { orderId, orderItemId, photoPath } */
  @Post("orders/item-photo")
  async itemPhoto(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.itemPhoto(user.id, parse(itemPhotoSchema, body));
  }

  /** POST /dealer/orders/:id/packed — every item photographed → ready for pickup. */
  @Post("orders/:id/packed")
  async packed(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.packed(user.id, id);
  }

  /** POST /dealer/shop { isOpen?, closedUntil? } */
  @Post("shop")
  async shop(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.shopState(user.id, parse(shopStateSchema, body));
  }

  /** POST /dealer/stock { productId, outOfStockUntil } */
  @Post("stock")
  async stock(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.dealer.setStock(user.id, parse(stockSchema, body));
  }
}
