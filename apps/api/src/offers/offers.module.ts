import { Module } from "@nestjs/common";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { SupabaseService } from "../supabase.service";

@Module({
  controllers: [OffersController],
  providers: [OffersService, SupabaseService],
  exports: [OffersService],
})
export class OffersModule {}
