import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { SupabaseService } from "../supabase.service";

@Module({
  controllers: [VoiceController],
  providers: [SupabaseService],
})
export class VoiceModule {}
