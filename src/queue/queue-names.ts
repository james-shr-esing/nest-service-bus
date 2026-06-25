import { requiredEnv } from '../env';

export const FUND_TRANSACTION_QUEUE = requiredEnv(
  'FUND_TRANSACTION_QUEUE_NAME',
);
export const WEBHOOK_DELIVERY_QUEUE = requiredEnv(
  'WEBHOOK_DELIVERY_QUEUE_NAME',
);
