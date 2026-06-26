export function getEventBusName(eventName: string): string {
  return `event.bus:${eventName}`;
}

export function getEventChannelName(eventName: string): string {
  return `event.channel:${eventName}`;
}
