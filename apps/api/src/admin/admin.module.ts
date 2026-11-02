import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SupabaseService } from "../supabase.service";
import { AdminOpsService } from "./admin-ops.service";
import { AdminAccountService } from "./admin-account.service";
import { DealerModule } from "../dealer/dealer.module";
import { OrdersService } from "../orders/orders.service";

@Module({
  imports: [DealerModule],
  controllers: [AdminController],
  providers: [AdminService, AdminOpsService, AdminAccountService, OrdersService, SupabaseService],
  exports: [AdminService],
})
export class AdminModule {}
