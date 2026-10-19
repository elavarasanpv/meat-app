import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { orderStatusSchema } from "@freshcut/shared";
import { OrdersService } from "./orders.service";
import { SupabaseService } from "../supabase.service";

const transitionBody = z.object({
  orderId: z.string().uuid(),
  to: orderStatusSchema,
  note: z.string().max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * POST /orders/transition
   * Skeleton endpoint: authenticates the caller, validates the body and
   * applies the state change. Role checks per transition (dealer can only
   * ACCEPT/PACK, rider only PICK_UP/DELIVER, etc.) come next.
   */
  @Post("transition")
  async transition(
    @Headers("authorization") auth: string | undefined,
    @Body() body: unknown,
  ) {
    const token = auth?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException();
    const user = await this.supabase.userFromToken(token);
    if (!user) throw new UnauthorizedException();

    const input = transitionBody.parse(body);
    return this.orders.transition({ ...input, actorId: user.id });
  }
}
