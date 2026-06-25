import { RoutingMessage } from '@nestjstools/messaging';
import type { IMessageBus } from '@nestjstools/messaging';
import type { Queue, QueueMessageHandler } from './queue.interface';

export class NestJsToolsQueueService<
  TPayload extends object = object,
> implements Queue<TPayload> {
  private handler?: QueueMessageHandler<TPayload>;

  constructor(
    private readonly messageBus: IMessageBus,
    private readonly routingKey: string,
  ) {}

  async send(payload: TPayload): Promise<void> {
    await this.messageBus.dispatch(
      new RoutingMessage(payload, this.routingKey),
    );
  }

  receive(handler: QueueMessageHandler<TPayload>): Promise<void> {
    this.handler = handler;
    return Promise.resolve();
  }

  async handle(payload: TPayload): Promise<void> {
    await this.handler?.(payload);
  }
}
