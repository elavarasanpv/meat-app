import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { OrdersModule } from "./orders/orders.module";
import { RiderModule } from "./rider/rider.module";
import { DealerModule } from "./dealer/dealer.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [OrdersModule, RiderModule, DealerModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
