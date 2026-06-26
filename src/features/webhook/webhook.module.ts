import { Module } from '@nestjs/common';
import { EventModule } from '../../event';
import {
  FUND_TRANSACTION_SUBSCRIPTION,
  FUND_TRANSACTION_TOPIC,
} from '../../event/event-names';
import { eventOptions } from '../../event/event-options';
import { QueueModule } from '../../queue';
import { WEBHOOK_DELIVERY_QUEUE } from '../../queue/queue-names';
import { queueOptions } from '../../queue/queue-options';
import { getFundTransactionSessionId } from '../fund-transaction-session.util';
import type { FundDomainEventNotificationPayload } from '../queue-payloads';
import { WebhookConsumer } from './webhook.consumer';

@Module({
  imports: [
    EventModule.forRoot(
      eventOptions<FundDomainEventNotificationPayload>(
        FUND_TRANSACTION_TOPIC,
        FUND_TRANSACTION_SUBSCRIPTION,
        true,
        {
          useSessions: true,
          sessionIdFactory: getFundTransactionSessionId,
        },
      ),
    ),
    QueueModule.forRoot(queueOptions(WEBHOOK_DELIVERY_QUEUE, false)),
  ],
  providers: [WebhookConsumer],
})
export class WebhookModule {}
