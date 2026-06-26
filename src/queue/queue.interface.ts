export type MessagingPackage = 'azure-sdk' | 'nest-js-tools';

export type QueueMessageHandler<TPayload> = (
  payload: TPayload,
) => Promise<void> | void;

export interface Queue<TPayload = unknown> {
  send(payload: TPayload): Promise<void>;
  receive(handler: QueueMessageHandler<TPayload>): Promise<void>;
}

export interface QueueModuleOptions {
  usePackage: MessagingPackage;
  connectionUrl: string;
  queueName: string;
  enableConsumer?: boolean;
}
