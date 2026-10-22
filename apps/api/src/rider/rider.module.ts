import { Module } from "@nestjs/common";
import { RiderController } from "./rider.controller";
import { SupabaseService } from "../supabase.service";

@Module({
  controllers: [RiderController],
  providers: [SupabaseService],
})
export class RiderModule {}
