import { DynamicModule, Module, Provider } from '@nestjs/common';
import { AzureSdkEventService } from './azure-sdk-event.service';
import type { EventModuleOptions } from './event.interface';
import { getEventToken } from './event.tokens';

@Module({})
export class EventModule {
  static forRoot<TPayload extends object = object>(
    options: EventModuleOptions<TPayload>,
  ): DynamicModule {
    const eventToken = getEventToken(options.topicName);

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
}
