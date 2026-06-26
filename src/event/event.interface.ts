export type MessagingPackage = 'azure-sdk' | 'nest-js-tools';

export type EventHandler<TPayload> = (
  payload: TPayload,
) => Promise<void> | void;

export type EventSessionIdFactory<TPayload> = (payload: TPayload) => string;

export interface EventBus<TPayload = unknown> {
  publish(payload: TPayload): Promise<void>;
  subscribe(handler: EventHandler<TPayload>): Promise<void>;
}

export interface EventModuleOptions<TPayload = unknown> {
  usePackage: MessagingPackage;
  connectionUrl: string;
  topicName: string;
  subscriptionName: string;
  enableConsumer?: boolean;
  useSessions?: boolean;
  sessionIdFactory?: EventSessionIdFactory<TPayload>;
  sessionIdleTimeoutMs?: number;
}
