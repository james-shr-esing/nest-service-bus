import { requiredEnv } from '../env';

export const WEBHOOK_DELIVERY_QUEUE = requiredEnv(
  'WEBHOOK_DELIVERY_QUEUE_NAME',
);
