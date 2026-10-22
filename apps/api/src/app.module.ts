import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { OrdersModule } from "./orders/orders.module";
import { RiderModule } from "./rider/rider.module";

@Module({
  imports: [OrdersModule, RiderModule],
  controllers: [HealthController],
})
export class AppModule {}
