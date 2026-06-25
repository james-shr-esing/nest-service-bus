export function getQueueBusName(queueName: string): string {
  return `queue.bus:${queueName}`;
}

export function getQueueChannelName(queueName: string): string {
  return `queue.channel:${queueName}`;
}
