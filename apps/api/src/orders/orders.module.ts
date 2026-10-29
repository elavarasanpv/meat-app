import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { SupabaseService } from "../supabase.service";
import { DealerModule } from "../dealer/dealer.module";

@Module({
  imports: [DealerModule],
  controllers: [OrdersController],
  providers: [OrdersService, SupabaseService],
})
export class OrdersModule {}
