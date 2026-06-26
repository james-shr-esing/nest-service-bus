import { DynamicModule, Inject, Module, Provider } from '@nestjs/common';
import { MessageHandler } from '@nestjstools/messaging';
import type { IMessageBus } from '@nestjstools/messaging';
import { AzureSdkEventService } from './azure-sdk-event.service';
import { getEventBusName } from './event-bus-names';
import type { EventModuleOptions } from './event.interface';
import { getEventToken } from './event.tokens';
import { NestJsToolsEventService } from './nest-js-tools-event.service';

@Module({})
export class EventModule {
  static forRoot<TPayload extends object = object>(
    options: EventModuleOptions<TPayload>,
  ): DynamicModule {
    const eventToken = getEventToken(options.topicName);
    const enableConsumer = options.enableConsumer ?? true;

    if (options.usePackage === 'azure-sdk') {
      const eventProvider: Provider = {
        provide: eventToken,
        useFactory: () =>
          new AzureSdkEventService(
            options.connectionUrl,
            options.topicName,
            options.subscriptionName,
            options.useSessions ?? false,
            options.sessionIdFactory,
            options.sessionIdleTimeoutMs,
          ),
      };

      return {
        module: EventModule,
        providers: [eventProvider],
        exports: [eventProvider],
      };
    }

    if (options.useSessions) {
      throw new Error(
        'Event sessions are only supported with USE_PACKAGE=azure-sdk. The nest-js-tools adapter does not expose Azure Service Bus session receivers.',
      );
    }

    const routingKey = options.topicName;
    const eventProvider: Provider = {
      provide: eventToken,
      useFactory: (messageBus: IMessageBus) =>
        new NestJsToolsEventService(messageBus, routingKey),
      inject: [getEventBusName(options.topicName)],
    };

    const providers: Provider[] = [eventProvider];

    if (enableConsumer) {
      const bridgeProviderToken = `${eventToken}:nest-js-tools-bridge`;

      class NestJsToolsEventBridge {
        constructor(
          private readonly eventBus: NestJsToolsEventService<object>,
        ) {}

        async handle(payload: object): Promise<void> {
          await this.eventBus.handle(payload);
        }
      }

      MessageHandler(routingKey)(NestJsToolsEventBridge);
      Inject(eventToken)(NestJsToolsEventBridge, undefined, 0);

      providers.push({
        provide: bridgeProviderToken,
        useClass: NestJsToolsEventBridge,
      });
    }

    return {
      module: EventModule,
      providers,
      exports: [eventProvider],
    };
  }
}
