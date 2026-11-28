import { Module } from "@nestjs/common";
import { AutoPushController } from "./auto-push.controller";
import { AutoPushService } from "./auto-push.service";
import { PushService } from "../push/push.service";
import { SupabaseService } from "../supabase.service";

@Module({
  controllers: [AutoPushController],
  providers: [AutoPushService, PushService, SupabaseService],
})
export class AutoPushModule {}
