import { Module } from '@nestjs/common';
import { EventModule } from '../../event';
import {
  FUND_TRANSACTION_SUBSCRIPTION,
  FUND_TRANSACTION_TOPIC,
} from '../../event/event-names';
import { eventOptions } from '../../event/event-options';
import { getFundTransactionSessionId } from '../fund-transaction-session.util';
import type { FundDomainEventNotificationPayload } from '../queue-payloads';
import { FundProducer } from './fund.producer';

@Module({
  imports: [
    EventModule.forRoot(
      eventOptions<FundDomainEventNotificationPayload>(
        FUND_TRANSACTION_TOPIC,
        FUND_TRANSACTION_SUBSCRIPTION,
        false,
        {
          useSessions: true,
          sessionIdFactory: getFundTransactionSessionId,
        },
      ),
    ),
  ],
  providers: [FundProducer],
})
export class FundModule {}
