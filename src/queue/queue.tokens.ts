import { Inject } from '@nestjs/common';

export function getQueueToken(queueName: string): string {
  return `queue:${queueName}`;
}

export function InjectQueue(queueName: string): ParameterDecorator {
  return Inject(getQueueToken(queueName));
}
