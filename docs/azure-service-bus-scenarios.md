# Azure Service Bus Scenario Tests

These scenarios use the current app flow:

```text
FundProducer -> topic subscription -> WebhookConsumer -> delivery queue -> DeliveryConsumer
```

The project now uses Azure SDK directly. The current event flow uses Azure Service Bus sessions, so the topic subscription must be session-enabled in Azure.

## Test Knobs

Set these environment variables per terminal:

```powershell
$env:AZURE_SERVICE_BUS_CONNECTION_STRING = 'Endpoint=sb://...'
$env:FUND_TRANSACTION_TOPIC_NAME = 'topic.fund.transaction.test'
$env:FUND_TRANSACTION_SUBSCRIPTION_NAME = 'subscription.session.webhook.transaction.test'
$env:WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook.delivery.test'
$env:INSTANCE_ID = 'app-a'
```

Optional knobs:

```powershell
$env:FUND_PUBLISH_INTERVAL_MS = '30000'
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '1'
$env:FUND_FIXED_RESOURCE_IDENTIFIER = ''
$env:FUND_STATUS_FLOW_MODE = 'off'
$env:FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = ''
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '0'
$env:WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS = '0'
$env:WEBHOOK_DELIVERY_PROCESSING_DELAY_MS = '0'
```

## 1. Same Subscription, Multiple Instances

Question: if multiple instances use the same topic subscription, does one event go to only one instance?

Expected Azure behavior:

- A topic subscription behaves like a virtual queue.
- Multiple receivers on the same subscription compete for messages.
- One message copy in that subscription is handled by one receiver, not every receiver.
- Delivery is still at-least-once, so retries, lock loss, crashes, and duplicate delivery are possible.

Run two terminals against the same Service Bus resources:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'app-a'
$env:FUND_PUBLISH_INTERVAL_MS = '5000'
npm run start:dev
```

```powershell
$env:PORT = '3002'
$env:INSTANCE_ID = 'app-b'
$env:FUND_PUBLISH_INTERVAL_MS = '5000'
npm run start:dev
```

Watch for:

```text
WebhookConsumer [app-a] Received deposit.completed ...
WebhookConsumer [app-b] Received deposit.completed ...
```

Each individual `resourceIdentifier` should appear on only one instance unless a retry or lock-loss case occurs.

Important note for this repo: `FundModule` also runs in each app instance, so both terminals produce events. If you only want one producer and many consumers, temporarily run one instance with the producer disabled in code or use separate processes/modules for producer and consumer.

Another important demo limitation: `WebhookDeliveryStoreService` is in-memory per process. With multiple app instances, instance A can write the delivery snapshot and enqueue `{ deliveryId }`, while instance B can consume that queue job and fail to find the snapshot locally. A real deployment needs shared persistence before enqueueing the queue job.

## 2. Queue Complete, Throw Error, Retry

Question: if queue handling throws before complete, can the message be received again?

Expected Azure behavior:

- The queue receiver uses Peek-Lock mode by default.
- This project sets `autoCompleteMessages: false`.
- `AzureSdkQueueService` calls `completeMessage()` only after the handler succeeds.
- If the handler throws, it calls `abandonMessage()`, making the message available again.
- The message retries until it succeeds or reaches the queue's `maxDeliveryCount`, then it goes to the dead-letter queue.

Run one terminal:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'retry-a'
$env:FUND_PUBLISH_INTERVAL_MS = '10000'
$env:WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS = '1'
npm run start:dev
```

Expected log shape:

```text
DeliveryConsumer [retry-a] Received delivery job ... localAttempt=1
DeliveryConsumer [retry-a] Throwing test error ...
AzureSdkQueue:webhook.delivery.test error ...
DeliveryConsumer [retry-a] Received delivery job ... localAttempt=2
DeliveryConsumer DB update webhook_delivery ... status=SUCCESS
```

If you set `WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS` higher than the entity `maxDeliveryCount`, the message should end up in the dead-letter queue.

For a clean retry test, use one app instance or replace the in-memory delivery store with shared storage. Otherwise a retried queue job may move to another process that cannot see the original snapshot.

## 3. Long Event Job, Then Another Event Arrives

Question: if topic event handling takes a long time and another event is published, what happens to the subscriber?

Expected Azure behavior:

- A receiver locks a message while processing.
- If processing finishes and `completeMessage()` is called before lock expiry, the message is removed.
- If processing exceeds lock renewal limits or the process dies before complete, the message can be redelivered.
- With sessions enabled, a session is locked by one receiver. Messages in the same session are processed in order by that receiver/session lock.
- Messages in different sessions can be handled by different receivers if multiple instances accept sessions.

Same-session test:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'long-a'
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '3'
$env:FUND_FIXED_RESOURCE_IDENTIFIER = 'deposit-long-job-001'
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '10000'
$env:FUND_PUBLISH_INTERVAL_MS = '60000'
npm run start:dev
```

Expected: all three events share the same session id, so this project's `AzureSdkEventService` drains them one at a time. The second event waits behind the first.

Different-session test:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'long-a'
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '3'
$env:FUND_FIXED_RESOURCE_IDENTIFIER = ''
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '10000'
$env:FUND_PUBLISH_INTERVAL_MS = '60000'
npm run start:dev
```

Expected in a single instance: this project currently has one session pump, so it still accepts and drains sessions sequentially.

Expected with multiple instances: different sessions can be picked up by different instances, so long work in one session does not necessarily block another instance from handling another session.

## 4. Session FIFO Status Flow

Question: if one transaction publishes multiple status-change events into the same session, does the subscriber receive them FIFO?

Status flow:

```text
1 prepare
2 reviewing
3 processing
4 processed
5 completed
```

Expected Azure behavior:

- Messages with the same `sessionId` are delivered in session order.
- In this project, `sessionId` is `${resourceType}:${resourceIdentifier}`, so all status events below share one session.
- Sequential publishing should be received in the same logical order.
- Concurrent publishing with `Promise.all` is a different test: Service Bus still preserves the broker's accepted order, but concurrent sends can reach the broker in a different order than the source array.

Sequential FIFO test:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'fifo-seq'
$env:FUND_STATUS_FLOW_MODE = 'sequential'
$env:FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = 'deposit-fifo-001'
$env:FUND_PUBLISH_INTERVAL_MS = '0'
npm run start:dev
```

Expected receive order:

```text
WebhookConsumer [fifo-seq] Received deposit.prepare status=prepare deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.reviewing status=reviewing deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.processing status=processing deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.processed status=processed deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.completed status=completed deposit-fifo-001
```

Concurrent send test:

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'fifo-concurrent'
$env:FUND_STATUS_FLOW_MODE = 'concurrent'
$env:FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = 'deposit-fifo-002'
$env:FUND_PUBLISH_INTERVAL_MS = '0'
npm run start:dev
```

Expected result: the subscriber still receives one message at a time for that session, but the observed order may or may not be `prepare -> reviewing -> processing -> processed -> completed`. If it differs, that does not mean sessions failed; it means the concurrent publishers reached the broker in a different order. For business-critical status transitions, publish sequentially, use a single ordered batch, or make consumers validate a monotonic version/sequence.

## Useful Azure References

- Topics and subscriptions: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions
- Message locks and settlement: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
- Message sessions: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions
- Dead-letter queues: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
