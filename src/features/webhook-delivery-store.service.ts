import { Injectable } from '@nestjs/common';
import type {
  WebhookDeliverySnapshot,
  WebhookDeliveryStatus,
} from './queue-payloads';

@Injectable()
export class WebhookDeliveryStoreService {
  private readonly snapshots = new Map<string, WebhookDeliverySnapshot>();

  save(snapshot: WebhookDeliverySnapshot): void {
    this.snapshots.set(snapshot.deliveryId, snapshot);
  }

  get(deliveryId: string): WebhookDeliverySnapshot | undefined {
    return this.snapshots.get(deliveryId);
  }

  updateStatus(
    deliveryId: string,
    status: WebhookDeliveryStatus,
  ): WebhookDeliverySnapshot | undefined {
    const snapshot = this.snapshots.get(deliveryId);

    if (!snapshot) {
      return undefined;
    }

    const updated: WebhookDeliverySnapshot = {
      ...snapshot,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.snapshots.set(deliveryId, updated);
    return updated;
  }
}
