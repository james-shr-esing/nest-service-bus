import { optionalEnv } from '../env';

export const FUND_TRANSACTION_TOPIC = optionalEnv(
  'FUND_TRANSACTION_TOPIC_NAME',
  'topic.fund.transaction.test',
);
export const FUND_TRANSACTION_SUBSCRIPTION = optionalEnv(
  'FUND_TRANSACTION_SUBSCRIPTION_NAME',
  'subscription.session.webhook.transaction.test',
);
