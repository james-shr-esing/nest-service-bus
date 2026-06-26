import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ServiceBusClient,
  ServiceBusMessage,
  ServiceBusReceiver,
  ServiceBusSender,
  ServiceBusSessionReceiver,
} from '@azure/service-bus';
import type {
  ProcessErrorArgs,
  ServiceBusReceivedMessage,
} from '@azure/service-bus';
import type {
  EventBus,
  EventHandler,
  EventSessionIdFactory,
} from './event.interface';

const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 5_000;
const SESSION_ACCEPT_RETRY_DELAY_MS = 1_000;

export class AzureSdkEventService<TPayload = unknown>
  implements EventBus<TPayload>, OnModuleDestroy
{
  private readonly logger: Logger;
  private readonly client: ServiceBusClient;
  private sender?: ServiceBusSender;
  private receiver?: ServiceBusReceiver;
  private subscription?: { close(): Promise<void> };
  private sessionPump?: Promise<void>;
  private readonly sessionReceivers = new Set<ServiceBusSessionReceiver>();
  private isClosing = false;

  constructor(
    private readonly connectionUrl: string,
    private readonly topicName: string,
    private readonly subscriptionName: string,
    private readonly useSessions = false,
    private readonly sessionIdFactory?: EventSessionIdFactory<TPayload>,
    private readonly sessionIdleTimeoutMs = DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  ) {
    this.logger = new Logger(`AzureSdkEvent:${topicName}`);
    this.client = new ServiceBusClient(connectionUrl);
  }

  async publish(payload: TPayload): Promise<void> {
    const sender = this.getSender();
    const sessionId = this.resolveSessionId(payload);
    const message: ServiceBusMessage = {
      body: payload,
      contentType: 'application/json',
      subject: this.topicName,
      sessionId,
      applicationProperties: {
        source: 'nest-service-bus',
      },
    };

    await sender.sendMessages(message);
  }

  subscribe(handler: EventHandler<TPayload>): Promise<void> {
    if (this.subscription || this.sessionPump) {
      throw new Error(
        `Event subscription for [${this.topicName}/${this.subscriptionName}] is already active`,
      );
    }

    if (this.useSessions) {
      this.sessionPump = this.startSessionPump(handler);
      return Promise.resolve();
    }

    this.receiver = this.client.createReceiver(
      this.topicName,
      this.subscriptionName,
    );
    this.subscription = this.receiver.subscribe(
      {
        processMessage: async (message) => {
          await this.processMessage(this.receiver, message, handler);
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
    this.isClosing = true;

    await this.subscription?.close();
    await this.receiver?.close();

    await Promise.all(
      Array.from(this.sessionReceivers).map((receiver) => receiver.close()),
    );

    await this.sender?.close();
    await this.client.close();
    await this.sessionPump?.catch((error: unknown) => {
      if (error instanceof Error) {
        this.logger.debug(error.message);
      }
    });
  }

  private getSender(): ServiceBusSender {
    this.sender ??= this.client.createSender(this.topicName);
    return this.sender;
  }

  private resolveSessionId(payload: TPayload): string | undefined {
    if (!this.useSessions) {
      return undefined;
    }

    const sessionId = this.sessionIdFactory?.(payload);

    if (!sessionId) {
      throw new Error(
        `Session id is required to publish to session-enabled topic [${this.topicName}]`,
      );
    }

    return sessionId;
  }

  private async startSessionPump(
    handler: EventHandler<TPayload>,
  ): Promise<void> {
    while (!this.isClosing) {
      let receiver: ServiceBusSessionReceiver | undefined;

      try {
        receiver = await this.client.acceptNextSession(
          this.topicName,
          this.subscriptionName,
        );
        this.sessionReceivers.add(receiver);
        this.logger.log(
          `Accepted session ${receiver.sessionId} for ${this.topicName}/${this.subscriptionName}`,
        );

        await this.drainSession(receiver, handler);
      } catch (error) {
        if (!this.isClosing) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Session receiver retry: ${message}`);
          await this.delay(SESSION_ACCEPT_RETRY_DELAY_MS);
        }
      } finally {
        if (receiver) {
          this.sessionReceivers.delete(receiver);
          await receiver.close().catch((error: unknown) => {
            if (error instanceof Error && !this.isClosing) {
              this.logger.warn(error.message);
            }
          });
        }
      }
    }
  }

  private async drainSession(
    receiver: ServiceBusSessionReceiver,
    handler: EventHandler<TPayload>,
  ): Promise<void> {
    while (!this.isClosing) {
      const messages = await receiver.receiveMessages(1, {
        maxWaitTimeInMs: this.sessionIdleTimeoutMs,
      });

      if (messages.length === 0) {
        return;
      }

      for (const message of messages) {
        await this.processMessage(receiver, message, handler);
      }
    }
  }

  private async processMessage(
    receiver: ServiceBusReceiver | ServiceBusSessionReceiver | undefined,
    message: ServiceBusReceivedMessage,
    handler: EventHandler<TPayload>,
  ): Promise<void> {
    try {
      await handler(message.body as TPayload);
      await receiver?.completeMessage(message);
    } catch (error) {
      await receiver?.abandonMessage(message);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readonly processError = (args: ProcessErrorArgs): Promise<void> => {
    this.logger.error(args.error.message, args.error.stack);
    return Promise.resolve();
  };
}
