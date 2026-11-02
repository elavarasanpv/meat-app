import { Module } from "@nestjs/common";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";

@Module({
  controllers: [SupportController],
  providers: [SupportService, SupabaseService, PushService],
  exports: [SupportService],
})
export class SupportModule {}
