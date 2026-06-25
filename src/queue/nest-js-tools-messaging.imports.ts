import { DynamicModule, Type } from '@nestjs/common';
import { MessagingModule } from '@nestjstools/messaging';
import {
  AzureServiceBusChannelConfig,
  MessagingAzureServiceBusExtensionModule,
  Mode,
} from '@nestjstools/messaging-azure-service-bus-extension';
import { optionalEnv, requiredEnv } from '../env';
import { FUND_TRANSACTION_QUEUE, WEBHOOK_DELIVERY_QUEUE } from './queue-names';
import { getQueueBusName, getQueueChannelName } from './queue-bus-names';
import { queueModeFromEnv } from './queue-options';

export function nestJsToolsMessagingImports(): Array<
  DynamicModule | Type<unknown>
> {
  if (queueModeFromEnv() !== 'nest-js-tools') {
    return [];
  }

  const connectionString = requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING');
  const queueNames = [FUND_TRANSACTION_QUEUE, WEBHOOK_DELIVERY_QUEUE];

  return [
    MessagingAzureServiceBusExtensionModule,
    MessagingModule.forRoot({
      buses: queueNames.map((queueName) => ({
        name: getQueueBusName(queueName),
        channels: [getQueueChannelName(queueName)],
      })),
      channels: queueNames.map(
        (queueName) =>
          new AzureServiceBusChannelConfig({
            name: getQueueChannelName(queueName),
            mode: Mode.QUEUE,
            connectionString,
            queue: queueName,
            enableConsumer: true,
            autoCreate: false,
          }),
      ),
      debug: optionalEnv('MESSAGING_DEBUG', 'false') === 'true',
    }),
  ];
}
