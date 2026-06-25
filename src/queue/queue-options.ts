import { optionalEnv, requiredEnv } from '../env';
import type { QueueMode, QueueModuleOptions } from './queue.interface';

const SUPPORTED_QUEUE_MODES = new Set<QueueMode>([
  'azure-sdk',
  'nest-js-tools',
]);

export function queueModeFromEnv(): QueueMode {
  const mode = optionalEnv('QUEUE_MODE', 'azure-sdk') as QueueMode;

  if (!SUPPORTED_QUEUE_MODES.has(mode)) {
    throw new Error(`Unsupported QUEUE_MODE: ${mode}`);
  }

  return mode;
}

export function queueOptions(queueName: string): QueueModuleOptions {
  return {
    mode: queueModeFromEnv(),
    connectionUrl: requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING'),
    queueName,
  };
}
