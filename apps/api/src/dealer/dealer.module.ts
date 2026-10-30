import { Module } from "@nestjs/common";
import { DealerController } from "./dealer.controller";
import { DealerService } from "./dealer.service";
import { AssignmentService } from "./assignment.service";
import { OrdersService } from "../orders/orders.service";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";

@Module({
  controllers: [DealerController],
  providers: [DealerService, AssignmentService, OrdersService, SupabaseService, PushService],
  exports: [AssignmentService, PushService],
})
export class DealerModule {}
