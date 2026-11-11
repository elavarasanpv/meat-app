import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SupabaseService } from "../supabase.service";
import { AdminOpsService } from "./admin-ops.service";
import { AdminAccountService } from "./admin-account.service";
import { DealerModule } from "../dealer/dealer.module";
import { SupportModule } from "../support/support.module";
import { OffersModule } from "../offers/offers.module";
import { OrdersService } from "../orders/orders.service";
import { PushService } from "../push/push.service";

@Module({
  imports: [DealerModule, SupportModule, OffersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminOpsService, AdminAccountService, OrdersService, PushService, SupabaseService],
  exports: [AdminService],
})
export class AdminModule {}
