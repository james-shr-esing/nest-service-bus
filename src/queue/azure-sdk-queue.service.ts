import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ServiceBusClient,
  ServiceBusMessage,
  ServiceBusReceiver,
  ServiceBusSender,
} from '@azure/service-bus';
import type { ProcessErrorArgs } from '@azure/service-bus';
import type { Queue, QueueMessageHandler } from './queue.interface';

export class AzureSdkQueueService<TPayload = unknown>
  implements Queue<TPayload>, OnModuleDestroy
{
  private readonly logger: Logger;
  private readonly client: ServiceBusClient;
  private sender?: ServiceBusSender;
  private receiver?: ServiceBusReceiver;
  private subscription?: { close(): Promise<void> };

  constructor(
    private readonly connectionUrl: string,
    private readonly queueName: string,
  ) {
    this.logger = new Logger(`AzureSdkQueue:${queueName}`);
    this.client = new ServiceBusClient(connectionUrl);
  }

  async send(payload: TPayload): Promise<void> {
    const sender = this.getSender();
    const message: ServiceBusMessage = {
      body: payload,
      contentType: 'application/json',
      subject: this.queueName,
      applicationProperties: {
        source: 'nest-service-bus',
      },
    };

    await sender.sendMessages(message);
  }

  receive(handler: QueueMessageHandler<TPayload>): Promise<void> {
    if (this.subscription) {
      throw new Error(
        `Queue receiver for [${this.queueName}] is already active`,
      );
    }

    this.receiver = this.client.createReceiver(this.queueName);
    this.subscription = this.receiver.subscribe(
      {
        processMessage: async (message) => {
          try {
            await handler(message.body as TPayload);
            await this.receiver?.completeMessage(message);
          } catch (error) {
            await this.receiver?.abandonMessage(message);
            throw error;
          }
        },
        processError: this.processError,
      },
      {
        autoCompleteMessages: false,
      },
    );

    return Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscription?.close();
    await this.receiver?.close();
    await this.sender?.close();
    await this.client.close();
  }

  private getSender(): ServiceBusSender {
    this.sender ??= this.client.createSender(this.queueName);
    return this.sender;
  }

  private readonly processError = (args: ProcessErrorArgs): Promise<void> => {
    this.logger.error(args.error.message, args.error.stack);
    return Promise.resolve();
  };
}
