import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue';
import {
  FUND_TRANSACTION_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
} from '../../queue/queue-names';
import { queueOptions } from '../../queue/queue-options';
import { WebhookConsumer } from './webhook.consumer';

@Module({
  imports: [
    QueueModule.forRoot(queueOptions(FUND_TRANSACTION_QUEUE)),
    QueueModule.forRoot(queueOptions(WEBHOOK_DELIVERY_QUEUE)),
  ],
  providers: [WebhookConsumer],
})
export class WebhookModule {}
