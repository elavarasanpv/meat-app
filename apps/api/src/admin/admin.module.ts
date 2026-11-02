import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SupabaseService } from "../supabase.service";
import { AdminOpsService } from "./admin-ops.service";
import { DealerModule } from "../dealer/dealer.module";
import { OrdersService } from "../orders/orders.service";

@Module({
  imports: [DealerModule],
  controllers: [AdminController],
  providers: [AdminService, AdminOpsService, OrdersService, SupabaseService],
  exports: [AdminService],
})
export class AdminModule {}
