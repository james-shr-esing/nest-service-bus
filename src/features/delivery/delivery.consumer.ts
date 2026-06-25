import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

  constructor(
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE)
    private readonly webhookDeliveryQueue: Queue<WebhookDeliveryExecutionPayload>,
    private readonly deliveryStore: WebhookDeliveryStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.webhookDeliveryQueue.receive((payload) => {
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
      this.printPostEndpoint(snapshot);
      this.printUpdateDeliveryStatus(payload.deliveryId, 'SUCCESS');
      this.deliveryStore.updateStatus(payload.deliveryId, 'SUCCESS');
    });
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
