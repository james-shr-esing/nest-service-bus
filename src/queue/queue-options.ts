import { requiredEnv } from '../env';
import type { QueueModuleOptions } from './queue.interface';

export function queueOptions(
  queueName: string,
  enableConsumer = true,
): QueueModuleOptions {
  return {
    connectionUrl: requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING'),
    queueName,
    enableConsumer,
  };
}
