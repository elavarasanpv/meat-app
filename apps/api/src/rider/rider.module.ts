import { Module } from "@nestjs/common";
import { RiderController } from "./rider.controller";
import { RiderService } from "./rider.service";
import { OrdersService } from "../orders/orders.service";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";

@Module({
  controllers: [RiderController],
  providers: [RiderService, OrdersService, SupabaseService, PushService],
})
export class RiderModule {}
