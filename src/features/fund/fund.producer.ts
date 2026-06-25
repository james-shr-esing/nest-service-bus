import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { optionalNumberEnv } from '../../env';
import { FUND_TRANSACTION_QUEUE } from '../../queue/queue-names';
import { InjectQueue } from '../../queue/queue.tokens';
import type { Queue } from '../../queue';
import type { FundDomainEventNotificationPayload } from '../queue-payloads';

@Injectable()
export class FundProducer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FundProducer.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectQueue(FUND_TRANSACTION_QUEUE)
    private readonly fundTransactionQueue: Queue<FundDomainEventNotificationPayload>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.publishTransaction();

    const intervalMs = optionalNumberEnv('FUND_PUBLISH_INTERVAL_MS', 30_000);
    this.timer = setInterval(() => {
      void this.publishTransaction();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async publishTransaction(): Promise<void> {
    const now = new Date().toISOString();
    const depositId = crypto.randomUUID();
    const payload: FundDomainEventNotificationPayload = {
      source: 'fund',
      eventKey: 'deposit.completed',
      resourceType: 'deposit',
      resourceIdentifier: depositId,
      merchantId: 'merchant-demo',
      occurredAt: now,
      data: {
        depositId,
        status: 'completed',
        amount: (Math.random() * 10_000).toFixed(8),
        asset: 'USDT',
        network: 'TRON',
        fromAddress: 'Tyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        toAddress: 'Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        transactionHash: `0x${crypto.randomUUID().replaceAll('-', '')}`,
        merchantReference: `demo-${depositId}`,
        createdAt: now,
        updatedAt: now,
      },
    };

    try {
      await this.fundTransactionQueue.send(payload);
      this.logger.log(
        `Sent ${payload.eventKey} ${payload.resourceIdentifier} to ${FUND_TRANSACTION_QUEUE}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send fund event: ${message}`);
    }
  }
}
