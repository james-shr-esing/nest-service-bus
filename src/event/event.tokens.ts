import { Inject } from '@nestjs/common';

export function getEventToken(eventName: string): string {
  return `event:${eventName}`;
}

export function InjectEvent(eventName: string): ParameterDecorator {
  return Inject(getEventToken(eventName));
}
