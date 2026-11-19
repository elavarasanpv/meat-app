import { Module } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";
import { CatalogService } from "./catalog.service";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogDealerController } from "./catalog-dealer.controller";

/** Grocery vertical catalog (G1). Dormant until verticals.grocery is active. */
@Module({
  controllers: [CatalogAdminController, CatalogDealerController],
  providers: [CatalogService, SupabaseService],
  exports: [CatalogService],
})
export class CatalogModule {}
