import { optionalEnv, requiredEnv } from '../env';
import type {
  EventModuleOptions,
  EventSessionIdFactory,
  MessagingPackage,
} from './event.interface';

const SUPPORTED_PACKAGES = new Set<MessagingPackage>([
  'azure-sdk',
  'nest-js-tools',
]);

export interface EventSessionOptions<TPayload> {
  useSessions?: boolean;
  sessionIdFactory?: EventSessionIdFactory<TPayload>;
  sessionIdleTimeoutMs?: number;
}

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

export function eventOptions<TPayload = unknown>(
  topicName: string,
  subscriptionName: string,
  enableConsumer = true,
  sessionOptions: EventSessionOptions<TPayload> = {},
): EventModuleOptions<TPayload> {
  return {
    usePackage: usePackageFromEnv(),
    connectionUrl: requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING'),
    topicName,
    subscriptionName,
    enableConsumer,
    useSessions: sessionOptions.useSessions,
    sessionIdFactory: sessionOptions.sessionIdFactory,
    sessionIdleTimeoutMs: sessionOptions.sessionIdleTimeoutMs,
  };
}
