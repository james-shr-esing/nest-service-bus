import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeliveryModule } from './features/delivery/delivery.module';
import { FundModule } from './features/fund/fund.module';
import { WebhookDeliveryStoreModule } from './features/webhook-delivery-store.module';
import { WebhookModule } from './features/webhook/webhook.module';

@Module({
  imports: [
    WebhookDeliveryStoreModule,
    FundModule,
    WebhookModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
