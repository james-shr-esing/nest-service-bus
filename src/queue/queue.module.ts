import { DynamicModule, Inject, Module, Provider } from '@nestjs/common';
import { MessageHandler } from '@nestjstools/messaging';
import type { IMessageBus } from '@nestjstools/messaging';
import { AzureSdkQueueService } from './azure-sdk-queue.service';
import { getQueueBusName } from './queue-bus-names';
import { NestJsToolsQueueService } from './nest-js-tools-queue.service';
import type { QueueModuleOptions } from './queue.interface';
import { getQueueToken } from './queue.tokens';

@Module({})
export class QueueModule {
  static forRoot(options: QueueModuleOptions): DynamicModule {
    const queueToken = getQueueToken(options.queueName);
    const enableConsumer = options.enableConsumer ?? true;

    if (options.usePackage === 'azure-sdk') {
      const queueProvider: Provider = {
        provide: queueToken,
        useFactory: () =>
          new AzureSdkQueueService(options.connectionUrl, options.queueName),
      };

      return {
        module: QueueModule,
        providers: [queueProvider],
        exports: [queueProvider],
      };
    }

    const routingKey = options.queueName;
    const queueProvider: Provider = {
      provide: queueToken,
      useFactory: (messageBus: IMessageBus) =>
        new NestJsToolsQueueService(messageBus, routingKey),
      inject: [getQueueBusName(options.queueName)],
    };

    const providers: Provider[] = [queueProvider];

    if (enableConsumer) {
      const bridgeProviderToken = `${queueToken}:nest-js-tools-bridge`;

      class NestJsToolsQueueBridge {
        constructor(private readonly queue: NestJsToolsQueueService<object>) {}

        async handle(payload: object): Promise<void> {
          await this.queue.handle(payload);
        }
      }

      MessageHandler(routingKey)(NestJsToolsQueueBridge);
      Inject(queueToken)(NestJsToolsQueueBridge, undefined, 0);

      providers.push({
        provide: bridgeProviderToken,
        useClass: NestJsToolsQueueBridge,
      });
    }

    return {
      module: QueueModule,
      providers,
      exports: [queueProvider],
    };
  }
}
