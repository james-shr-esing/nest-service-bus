import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue';
import { WEBHOOK_DELIVERY_QUEUE } from '../../queue/queue-names';
import { queueOptions } from '../../queue/queue-options';
import { DeliveryConsumer } from './delivery.consumer';

@Module({
  imports: [QueueModule.forRoot(queueOptions(WEBHOOK_DELIVERY_QUEUE))],
  providers: [DeliveryConsumer],
})
export class DeliveryModule {}
