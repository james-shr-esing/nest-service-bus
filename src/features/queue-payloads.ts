export const WEBHOOK_API_VERSION = '2026-06-01' as const;

export type IsoDateTimeString = string;
export type DecimalString = string;

export type FundEventSource = 'fund';
export type FundResourceType = 'deposit' | 'withdrawal';

export type DepositEventKey =
  | 'deposit.created'
  | 'deposit.failed'
  | 'deposit.completed'
  | 'deposit.blocked';

export type WithdrawalEventKey =
  | 'withdrawal.created'
  | 'withdrawal.cancelled'
  | 'withdrawal.failed'
  | 'withdrawal.completed';

export type FundDomainEventKey = DepositEventKey | WithdrawalEventKey;

export type DepositStatus = 'created' | 'failed' | 'completed' | 'blocked';
export type WithdrawalStatus = 'created' | 'cancelled' | 'failed' | 'completed';
export type WebhookDeliveryStatus =
  | 'PENDING'
  | 'DELIVERING'
  | 'SUCCESS'
  | 'FAILED';

export type DepositEventData = {
  depositId: string;
  status: DepositStatus;
  amount: DecimalString;
  asset: string;
  network: string;
  fromAddress?: string;
  toAddress: string;
  transactionHash?: string;
  merchantReference?: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type WithdrawalEventData = {
  withdrawalId: string;
  status: WithdrawalStatus;
  amount: DecimalString;
  asset: string;
  network: string;
  toAddress: string;
  merchantReference?: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type DomainEventNotificationPayload<
  TEventKey extends string,
  TResourceType extends string,
  TData extends object,
> = {
  source: FundEventSource;
  eventKey: TEventKey;
  resourceType: TResourceType;
  resourceIdentifier: string;
  merchantId: string;
  occurredAt: IsoDateTimeString;
  data: TData;
};

export type DepositDomainEventNotificationPayload =
  DomainEventNotificationPayload<DepositEventKey, 'deposit', DepositEventData>;

export type WithdrawalDomainEventNotificationPayload =
  DomainEventNotificationPayload<
    WithdrawalEventKey,
    'withdrawal',
    WithdrawalEventData
  >;

export type FundDomainEventNotificationPayload =
  | DepositDomainEventNotificationPayload
  | WithdrawalDomainEventNotificationPayload;

export type WebhookPayloadEnvelope<TData extends object> = {
  id: string;
  eventKey: FundDomainEventKey;
  occurredAt: IsoDateTimeString;
  deliveredAt: IsoDateTimeString;
  merchantId: string;
  apiVersion: typeof WEBHOOK_API_VERSION;
  data: TData;
};

export type DepositWebhookPayload = WebhookPayloadEnvelope<DepositEventData>;
export type WithdrawalWebhookPayload =
  WebhookPayloadEnvelope<WithdrawalEventData>;

export type WebhookDeliveryPayload =
  | DepositWebhookPayload
  | WithdrawalWebhookPayload;

export type WebhookEndpointSnapshot = {
  endpointUrl: string;
};

export type WebhookDeliverySnapshot = {
  deliveryId: string;
  status: WebhookDeliveryStatus;
  payload: WebhookDeliveryPayload;
  endpoint: WebhookEndpointSnapshot;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

export type WebhookDeliveryExecutionPayload = {
  deliveryId: string;
};

export type FundTransactionPayload = FundDomainEventNotificationPayload;
