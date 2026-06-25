import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue';
import { FUND_TRANSACTION_QUEUE } from '../../queue/queue-names';
import { queueOptions } from '../../queue/queue-options';
import { FundProducer } from './fund.producer';

@Module({
  imports: [QueueModule.forRoot(queueOptions(FUND_TRANSACTION_QUEUE))],
  providers: [FundProducer],
})
export class FundModule {}
