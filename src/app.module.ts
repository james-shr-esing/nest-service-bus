import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeliveryModule } from './features/delivery/delivery.module';
import { FundModule } from './features/fund/fund.module';
import { WebhookDeliveryStoreModule } from './features/webhook-delivery-store.module';
import { WebhookModule } from './features/webhook/webhook.module';
import { nestJsToolsMessagingImports } from './queue/nest-js-tools-messaging.imports';

@Module({
  imports: [
    ...nestJsToolsMessagingImports(),
    WebhookDeliveryStoreModule,
    FundModule,
    WebhookModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
