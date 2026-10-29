import { Module } from "@nestjs/common";
import { DealerController } from "./dealer.controller";
import { DealerService } from "./dealer.service";
import { AssignmentService } from "./assignment.service";
import { OrdersService } from "../orders/orders.service";
import { SupabaseService } from "../supabase.service";

@Module({
  controllers: [DealerController],
  providers: [DealerService, AssignmentService, OrdersService, SupabaseService],
  exports: [AssignmentService],
})
export class DealerModule {}
