import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FUND_TRANSACTION_TOPIC } from '../../event/event-names';
import { InjectEvent } from '../../event/event.tokens';
import type { EventBus } from '../../event';
import { WEBHOOK_DELIVERY_QUEUE } from '../../queue/queue-names';
import { InjectQueue } from '../../queue/queue.tokens';
import { WebhookDeliveryStoreService } from '../webhook-delivery-store.service';
import type { Queue } from '../../queue';
import type {
  FundDomainEventNotificationPayload,
  WebhookDeliveryExecutionPayload,
  WebhookDeliveryPayload,
  WebhookDeliverySnapshot,
  WebhookEndpointSnapshot,
} from '../queue-payloads';
import { WEBHOOK_API_VERSION } from '../queue-payloads';

@Injectable()
export class WebhookConsumer implements OnModuleInit {
  private readonly logger = new Logger(WebhookConsumer.name);

  constructor(
    @InjectEvent(FUND_TRANSACTION_TOPIC)
    private readonly fundTransactionEvent: EventBus<FundDomainEventNotificationPayload>,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE)
    private readonly webhookDeliveryQueue: Queue<WebhookDeliveryExecutionPayload>,
    private readonly deliveryStore: WebhookDeliveryStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fundTransactionEvent.subscribe(async (payload) => {
      const deliveryId = crypto.randomUUID();
      const now = new Date().toISOString();
      const deliveryPayload = this.toWebhookDeliveryPayload(
        deliveryId,
        payload,
      );
      const endpoint = this.resolveEndpointSnapshot(payload);
      const snapshot: WebhookDeliverySnapshot = {
        deliveryId,
        status: 'PENDING',
        payload: deliveryPayload,
        endpoint,
        createdAt: now,
        updatedAt: now,
      };
      const deliveryJob: WebhookDeliveryExecutionPayload = { deliveryId };

      this.printWriteDeliveryPayloadToDb(snapshot);
      this.deliveryStore.save(snapshot);
      this.printDeliveryStatus(snapshot.deliveryId, snapshot.status);

      await this.webhookDeliveryQueue.send(deliveryJob);
      this.logger.log(
        `Published delivery execution job ${deliveryId} to ${WEBHOOK_DELIVERY_QUEUE}`,
      );
    });
  }

  private toWebhookDeliveryPayload(
    deliveryId: string,
    event: FundDomainEventNotificationPayload,
  ): WebhookDeliveryPayload {
    switch (event.resourceType) {
      case 'deposit':
        return {
          id: deliveryId,
          eventKey: event.eventKey,
          occurredAt: event.occurredAt,
          deliveredAt: new Date().toISOString(),
          merchantId: event.merchantId,
          apiVersion: WEBHOOK_API_VERSION,
          data: event.data,
        };
      case 'withdrawal':
        return {
          id: deliveryId,
          eventKey: event.eventKey,
          occurredAt: event.occurredAt,
          deliveredAt: new Date().toISOString(),
          merchantId: event.merchantId,
          apiVersion: WEBHOOK_API_VERSION,
          data: event.data,
        };
    }
  }

  private resolveEndpointSnapshot(
    event: FundDomainEventNotificationPayload,
  ): WebhookEndpointSnapshot {
    return {
      endpointUrl: `https://merchant.example.com/webhooks/${event.merchantId}`,
    };
  }

  private printWriteDeliveryPayloadToDb(
    snapshot: WebhookDeliverySnapshot,
  ): void {
    this.logger.log(
      `DB write webhook_delivery ${snapshot.deliveryId}: eventKey=${snapshot.payload.eventKey}, merchantId=${snapshot.payload.merchantId}, endpointUrl=${snapshot.endpoint.endpointUrl}`,
    );
    this.logger.debug(
      `DB write payload snapshot: ${JSON.stringify(snapshot.payload)}`,
    );
  }

  private printDeliveryStatus(deliveryId: string, status: string): void {
    this.logger.log(
      `DB write webhook_delivery status ${deliveryId}: ${status}`,
    );
  }
}
