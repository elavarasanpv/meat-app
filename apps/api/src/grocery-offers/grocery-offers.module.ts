import { Module } from "@nestjs/common";
import { AdminShopOffersController, CustomerGroceryOffersController, ShopOffersController } from "./grocery-offers.controller";
import { GroceryOffersService } from "./grocery-offers.service";
import { PushService } from "../push/push.service";
import { SupabaseService } from "../supabase.service";
import { ImagesModule } from "../images/images.module";

@Module({
  imports: [ImagesModule],
  controllers: [ShopOffersController, AdminShopOffersController, CustomerGroceryOffersController],
  providers: [GroceryOffersService, PushService, SupabaseService],
  exports: [GroceryOffersService],
})
export class GroceryOffersModule {}
