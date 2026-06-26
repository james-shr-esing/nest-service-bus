import { RoutingMessage } from '@nestjstools/messaging';
import type { IMessageBus } from '@nestjstools/messaging';
import type { EventBus, EventHandler } from './event.interface';

export class NestJsToolsEventService<
  TPayload extends object = object,
> implements EventBus<TPayload> {
  private handler?: EventHandler<TPayload>;

  constructor(
    private readonly messageBus: IMessageBus,
    private readonly routingKey: string,
  ) {}

  async publish(payload: TPayload): Promise<void> {
    await this.messageBus.dispatch(
      new RoutingMessage(payload, this.routingKey),
    );
  }

  subscribe(handler: EventHandler<TPayload>): Promise<void> {
    this.handler = handler;
    return Promise.resolve();
  }

  async handle(payload: TPayload): Promise<void> {
    await this.handler?.(payload);
  }
}
