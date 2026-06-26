import type { FundDomainEventNotificationPayload } from './queue-payloads';

export function getFundTransactionSessionId(
  payload: FundDomainEventNotificationPayload,
): string {
  return `${payload.resourceType}:${payload.resourceIdentifier}`;
}
