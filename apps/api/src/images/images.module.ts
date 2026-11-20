import { Module } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";
import { ImagesService } from "./images.service";

/** Catalogue photo storage (resize → WebP → product-images bucket). */
@Module({
  providers: [ImagesService, SupabaseService],
  exports: [ImagesService],
})
export class ImagesModule {}
