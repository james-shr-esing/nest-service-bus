import { DynamicModule, Type } from '@nestjs/common';
import { MessagingModule } from '@nestjstools/messaging';
import {
  AzureServiceBusChannelConfig,
  MessagingAzureServiceBusExtensionModule,
  Mode,
} from '@nestjstools/messaging-azure-service-bus-extension';
import {
  FUND_TRANSACTION_SUBSCRIPTION,
  FUND_TRANSACTION_TOPIC,
} from '../event/event-names';
import { getEventBusName, getEventChannelName } from '../event/event-bus-names';
import { optionalEnv, requiredEnv } from '../env';
import { WEBHOOK_DELIVERY_QUEUE } from './queue-names';
import { getQueueBusName, getQueueChannelName } from './queue-bus-names';
import { usePackageFromEnv } from './queue-options';

export function nestJsToolsMessagingImports(): Array<
  DynamicModule | Type<unknown>
> {
  if (usePackageFromEnv() !== 'nest-js-tools') {
    return [];
  }

  const connectionString = requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING');

  return [
    MessagingAzureServiceBusExtensionModule,
    MessagingModule.forRoot({
      buses: [
        {
          name: getEventBusName(FUND_TRANSACTION_TOPIC),
          channels: [getEventChannelName(FUND_TRANSACTION_TOPIC)],
        },
        {
          name: getQueueBusName(WEBHOOK_DELIVERY_QUEUE),
          channels: [getQueueChannelName(WEBHOOK_DELIVERY_QUEUE)],
        },
      ],
      channels: [
        new AzureServiceBusChannelConfig({
          name: getEventChannelName(FUND_TRANSACTION_TOPIC),
          mode: Mode.TOPIC,
          connectionString,
          topic: FUND_TRANSACTION_TOPIC,
          subscription: FUND_TRANSACTION_SUBSCRIPTION,
          enableConsumer: true,
          autoCreate: false,
        }),
        new AzureServiceBusChannelConfig({
          name: getQueueChannelName(WEBHOOK_DELIVERY_QUEUE),
          mode: Mode.QUEUE,
          connectionString,
          queue: WEBHOOK_DELIVERY_QUEUE,
          enableConsumer: true,
          autoCreate: false,
        }),
      ],
      debug: optionalEnv('MESSAGING_DEBUG', 'false') === 'true',
    }),
  ];
}
