import { DynamicModule, Module, Provider } from '@nestjs/common';
import { AzureSdkQueueService } from './azure-sdk-queue.service';
import type { QueueModuleOptions } from './queue.interface';
import { getQueueToken } from './queue.tokens';

@Module({})
export class QueueModule {
  static forRoot(options: QueueModuleOptions): DynamicModule {
    const queueToken = getQueueToken(options.queueName);

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
}
