import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { SuggestionsService } from "./suggestions.service";
import { OffersModule } from "../offers/offers.module";
import { SupabaseService } from "../supabase.service";
import { DealerModule } from "../dealer/dealer.module";

@Module({
  imports: [DealerModule, OffersModule],
  controllers: [OrdersController],
  providers: [OrdersService, SuggestionsService, SupabaseService],
})
export class OrdersModule {}
