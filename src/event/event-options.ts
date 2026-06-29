import { requiredEnv } from '../env';
import type {
  EventModuleOptions,
  EventSessionIdFactory,
} from './event.interface';

export interface EventSessionOptions<TPayload> {
  useSessions?: boolean;
  sessionIdFactory?: EventSessionIdFactory<TPayload>;
  sessionIdleTimeoutMs?: number;
}

export function eventOptions<TPayload = unknown>(
  topicName: string,
  subscriptionName: string,
  enableConsumer = true,
  sessionOptions: EventSessionOptions<TPayload> = {},
): EventModuleOptions<TPayload> {
  return {
    connectionUrl: requiredEnv('AZURE_SERVICE_BUS_CONNECTION_STRING'),
    topicName,
    subscriptionName,
    enableConsumer,
    useSessions: sessionOptions.useSessions,
    sessionIdFactory: sessionOptions.sessionIdFactory,
    sessionIdleTimeoutMs: sessionOptions.sessionIdleTimeoutMs,
  };
}
