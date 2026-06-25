import { Global, Module } from '@nestjs/common';
import { WebhookDeliveryStoreService } from './webhook-delivery-store.service';

@Global()
@Module({
  providers: [WebhookDeliveryStoreService],
  exports: [WebhookDeliveryStoreService],
})
export class WebhookDeliveryStoreModule {}
