import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { optionalEnv, optionalNumberEnv } from '../../env';
import { WEBHOOK_DELIVERY_QUEUE } from '../../queue/queue-names';
import { InjectQueue } from '../../queue/queue.tokens';
import { WebhookDeliveryStoreService } from '../webhook-delivery-store.service';
import type { Queue } from '../../queue';
import type {
  WebhookDeliveryExecutionPayload,
  WebhookDeliverySnapshot,
  WebhookDeliveryStatus,
} from '../queue-payloads';

@Injectable()
export class DeliveryConsumer implements OnModuleInit {
  private readonly logger = new Logger(DeliveryConsumer.name);
  private readonly instanceId = optionalEnv(
    'INSTANCE_ID',
    `pid-${process.pid}`,
  );
  private readonly failFirstAttempts = optionalNumberEnv(
    'WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS',
    0,
  );
  private readonly processingDelayMs = optionalNumberEnv(
    'WEBHOOK_DELIVERY_PROCESSING_DELAY_MS',
    0,
  );
  private readonly attempts = new Map<string, number>();

  constructor(
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE)
    private readonly webhookDeliveryQueue: Queue<WebhookDeliveryExecutionPayload>,
    private readonly deliveryStore: WebhookDeliveryStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.webhookDeliveryQueue.receive(async (payload) => {
      const attempt = this.nextAttempt(payload.deliveryId);

      this.logger.log(
        `[${this.instanceId}] Received delivery job ${payload.deliveryId}; localAttempt=${attempt}`,
      );
      this.printFindDeliveryById(payload.deliveryId);
      const snapshot = this.deliveryStore.get(payload.deliveryId);

      if (!snapshot) {
        this.logger.warn(
          `DB result webhook_delivery ${payload.deliveryId}: not found`,
        );
        return;
      }

      this.printLoadedDelivery(snapshot);
      this.printUpdateDeliveryStatus(payload.deliveryId, 'DELIVERING');
      this.deliveryStore.updateStatus(payload.deliveryId, 'DELIVERING');

      if (this.processingDelayMs > 0) {
        this.logger.log(
          `[${this.instanceId}] Delaying delivery job ${payload.deliveryId} for ${this.processingDelayMs}ms`,
        );
        await this.delay(this.processingDelayMs);
      }

      if (attempt <= this.failFirstAttempts) {
        this.logger.warn(
          `[${this.instanceId}] Throwing test error for ${payload.deliveryId}; localAttempt=${attempt}`,
        );
        throw new Error(
          `Intentional delivery failure for ${payload.deliveryId} on local attempt ${attempt}`,
        );
      }

      this.printPostEndpoint(snapshot);
      this.printUpdateDeliveryStatus(payload.deliveryId, 'SUCCESS');
      this.deliveryStore.updateStatus(payload.deliveryId, 'SUCCESS');
    });
  }

  private nextAttempt(deliveryId: string): number {
    const attempt = (this.attempts.get(deliveryId) ?? 0) + 1;
    this.attempts.set(deliveryId, attempt);
    return attempt;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private printFindDeliveryById(deliveryId: string): void {
    this.logger.log(`DB query webhook_delivery by deliveryId=${deliveryId}`);
  }

  private printLoadedDelivery(snapshot: WebhookDeliverySnapshot): void {
    this.logger.log(
      `DB result webhook_delivery ${snapshot.deliveryId}: status=${snapshot.status}, eventKey=${snapshot.payload.eventKey}, endpointUrl=${snapshot.endpoint.endpointUrl}`,
    );
  }

  private printUpdateDeliveryStatus(
    deliveryId: string,
    status: WebhookDeliveryStatus,
  ): void {
    this.logger.log(
      `DB update webhook_delivery ${deliveryId}: status=${status}`,
    );
  }

  private printPostEndpoint(snapshot: WebhookDeliverySnapshot): void {
    this.logger.log(
      `POST ${snapshot.endpoint.endpointUrl}: deliveryId=${snapshot.deliveryId}, eventKey=${snapshot.payload.eventKey}`,
    );
  }
}
