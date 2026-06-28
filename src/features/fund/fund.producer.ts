import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { FUND_TRANSACTION_TOPIC } from '../../event/event-names';
import { InjectEvent } from '../../event/event.tokens';
import type { EventBus } from '../../event';
import { optionalEnv, optionalNumberEnv } from '../../env';
import type {
  DepositEventKey,
  DepositStatus,
  FundDomainEventNotificationPayload,
} from '../queue-payloads';

type StatusFlowMode = 'off' | 'sequential' | 'concurrent';

const STATUS_FLOW: Array<{
  sequence: number;
  status: DepositStatus;
  eventKey: DepositEventKey;
}> = [
  { sequence: 1, status: 'prepare', eventKey: 'deposit.prepare' },
  { sequence: 2, status: 'reviewing', eventKey: 'deposit.reviewing' },
  { sequence: 3, status: 'processing', eventKey: 'deposit.processing' },
  { sequence: 4, status: 'processed', eventKey: 'deposit.processed' },
  { sequence: 5, status: 'completed', eventKey: 'deposit.completed' },
];

@Injectable()
export class FundProducer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FundProducer.name);
  private readonly instanceId = optionalEnv(
    'INSTANCE_ID',
    `pid-${process.pid}`,
  );
  private readonly bootstrapPublishCount = optionalNumberEnv(
    'FUND_PUBLISH_ON_BOOTSTRAP_COUNT',
    1,
  );
  private readonly fixedResourceIdentifier = optionalEnv(
    'FUND_FIXED_RESOURCE_IDENTIFIER',
    '',
  );
  private readonly statusFlowMode = optionalEnv(
    'FUND_STATUS_FLOW_MODE',
    'off',
  ) as StatusFlowMode;
  private readonly statusFlowResourceIdentifier = optionalEnv(
    'FUND_STATUS_FLOW_RESOURCE_IDENTIFIER',
    '',
  );
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectEvent(FUND_TRANSACTION_TOPIC)
    private readonly fundTransactionEvent: EventBus<FundDomainEventNotificationPayload>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.statusFlowMode !== 'off') {
      await this.publishStatusFlow();
    } else {
      for (let index = 0; index < this.bootstrapPublishCount; index += 1) {
        await this.publishTransaction(index + 1);
      }
    }

    const intervalMs = optionalNumberEnv('FUND_PUBLISH_INTERVAL_MS', 30_000);
    if (intervalMs <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.publishTransaction();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async publishTransaction(sequence = 1): Promise<void> {
    const now = new Date().toISOString();
    const depositId = this.fixedResourceIdentifier || crypto.randomUUID();
    const payload = this.createDepositPayload({
      depositId,
      eventKey: 'deposit.completed',
      status: 'completed',
      sequence,
      occurredAt: now,
    });

    await this.publishPayload(payload, sequence);
  }

  private async publishStatusFlow(): Promise<void> {
    const depositId =
      this.statusFlowResourceIdentifier ||
      this.fixedResourceIdentifier ||
      crypto.randomUUID();
    const now = new Date().toISOString();
    const payloads = STATUS_FLOW.map(({ eventKey, sequence, status }) =>
      this.createDepositPayload({
        depositId,
        eventKey,
        status,
        sequence,
        occurredAt: now,
      }),
    );

    this.logger.log(
      `[${this.instanceId}] Publishing status flow in ${this.statusFlowMode} mode for ${depositId}: ${STATUS_FLOW.map(({ sequence, status }) => `${sequence}:${status}`).join(', ')}`,
    );

    if (this.statusFlowMode === 'concurrent') {
      await Promise.all(
        payloads.map((payload, index) =>
          this.publishPayload(payload, index + 1),
        ),
      );
      return;
    }

    if (this.statusFlowMode === 'sequential') {
      for (const [index, payload] of payloads.entries()) {
        await this.publishPayload(payload, index + 1);
      }
      return;
    }

    throw new Error(
      `Unsupported FUND_STATUS_FLOW_MODE: ${this.statusFlowMode}`,
    );
  }

  private createDepositPayload(options: {
    depositId: string;
    eventKey: DepositEventKey;
    status: DepositStatus;
    sequence: number;
    occurredAt: string;
  }): FundDomainEventNotificationPayload {
    return {
      source: 'fund',
      eventKey: options.eventKey,
      resourceType: 'deposit',
      resourceIdentifier: options.depositId,
      merchantId: 'merchant-demo',
      occurredAt: options.occurredAt,
      data: {
        depositId: options.depositId,
        status: options.status,
        amount: (Math.random() * 10_000).toFixed(8),
        asset: 'USDT',
        network: 'TRON',
        fromAddress: 'Tyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        toAddress: 'Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        transactionHash: `0x${crypto.randomUUID().replaceAll('-', '')}`,
        merchantReference: `demo-${options.depositId}`,
        createdAt: options.occurredAt,
        updatedAt: options.occurredAt,
      },
    };
  }

  private async publishPayload(
    payload: FundDomainEventNotificationPayload,
    sequence: number,
  ): Promise<void> {
    try {
      await this.fundTransactionEvent.publish(payload);
      this.logger.log(
        `[${this.instanceId}] Published #${sequence} ${payload.eventKey} status=${payload.data.status} ${payload.resourceIdentifier} to topic ${FUND_TRANSACTION_TOPIC}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to publish fund event: ${message}`);
    }
  }
}
