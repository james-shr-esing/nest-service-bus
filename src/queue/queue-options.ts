import { optionalEnv, requiredEnv } from '../env';
import type { MessagingPackage, QueueModuleOptions } from './queue.interface';

const SUPPORTED_PACKAGES = new Set<MessagingPackage>([
  'azure-sdk',
  'nest-js-tools',
]);

export function usePackageFromEnv(): MessagingPackage {
  const usePackage = optionalEnv(
    'USE_PACKAGE',
    'azure-sdk',
  ) as MessagingPackage;

  if (!SUPPORTED_PACKAGES.has(usePackage)) {
    throw new Error(`Unsupported USE_PACKAGE: ${usePackage}`);
  }

  return usePackage;
}

export function queueOptions(
  queueName: string,
  enableConsumer = true,
): QueueModuleOptions {
  return {
    usePackage: usePackageFromEnv(),
    connectionUrl: requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING'),
    queueName,
    enableConsumer,
  };
}
