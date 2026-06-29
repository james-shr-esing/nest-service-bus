# Nest Service Bus Demo

這個專案示範在 NestJS 中透過 Azure 官方 SDK `@azure/service-bus` 整合 Azure Service Bus queue/topic，並透過 `QueueModule` / `EventModule` 封裝 messaging 操作，讓 feature module 只依賴簡單的 `send` / `receive` 介面。

目前團隊決策固定使用 Azure SDK 串接。Fund transaction event 透過 topic 廣播，Webhook 透過 session-enabled subscription 收聽，並以 Azure Service Bus sessions 確保同一筆交易事件 FIFO。

## Architecture

主要 queue abstraction 位於 `src/queue`，用於 point-to-point work queue：

```ts
export interface Queue<TPayload = unknown> {
  send(payload: TPayload): Promise<void>;
  receive(handler: QueueMessageHandler<TPayload>): Promise<void>;
}
```

Feature module 透過 `QueueModule.forRoot(...)` 註冊 queue，並用 `@InjectQueue(queueName)` 注入泛型 queue。topic pub/sub 則由 `src/event` 的 `EventModule` 管理：

```ts
EventModule.forRoot(
  eventOptions(FUND_TRANSACTION_TOPIC, FUND_TRANSACTION_SUBSCRIPTION),
);
```

```ts
constructor(
  @InjectEvent(FUND_TRANSACTION_TOPIC)
  private readonly eventBus: EventBus<FundDomainEventNotificationPayload>,
) {}
```

## Payload Contracts

Payload 型別集中在 `src/features/queue-payloads.ts`，目前對齊 webhook design draft 的三個概念。

### Domain Event Notification

`topic.fund.transaction.test` topic 承載 Fund service 發出的 domain event notification：

```ts
export type FundDomainEventNotificationPayload =
  | DepositDomainEventNotificationPayload
  | WithdrawalDomainEventNotificationPayload;
```

核心 envelope：

```ts
{
  source: 'fund';
  eventKey: 'deposit.completed';
  resourceType: 'deposit';
  resourceIdentifier: string;
  merchantId: string;
  occurredAt: string;
  data: DepositEventData;
}
```

`data` 目前支援 deposit / withdrawal 兩類穩定欄位，例如金額、asset、network、merchantReference、createdAt、updatedAt。

### Webhook Payload Envelope

`WebhookDeliveryPayload` 代表未來要 POST 給商戶的 webhook request body envelope：

```ts
{
  id: string;
  eventKey: FundDomainEventKey;
  occurredAt: string;
  deliveredAt: string;
  merchantId: string;
  apiVersion: '2026-06-01';
  data: DepositEventData | WithdrawalEventData;
}
```

正式專案中 inbound consumer 建立 delivery 時會保存 payload snapshot；worker 執行時應使用 snapshot，而不是重新查交易現況。這個 demo 會在 `WebhookConsumer` 內將 Fund domain event 轉成 `WebhookDeliveryPayload`，並用 in-memory store 模擬保存 snapshot。

### Delivery Execution Job

`webhook-delivery` queue 承載的是 delivery execution job，不承載完整 webhook body：

```ts
export type WebhookDeliveryExecutionPayload = {
  deliveryId: string;
};
```

Worker 收到 `deliveryId` 後，正式專案應從 persistence 讀取 delivery snapshot、endpoint snapshot 與 signing secret，再執行 POST。這個 demo 會從 in-memory store 讀取剛才建立的 payload snapshot。

## Azure SDK Behavior

本專案固定使用 Azure SDK：

- `ServiceBusClient.createSender(queueName)` 發送 queue message
- `ServiceBusClient.createReceiver(queueName).subscribe(...)` 接收 queue message
- `EventModule` 用 `ServiceBusClient.createSender(topicName)` 廣播 topic message
- `EventModule` 開啟 session 時用 `ServiceBusClient.acceptNextSession(topicName, subscriptionName)` 訂閱 topic message
- handler 成功後 `completeMessage()`
- handler 失敗時 `abandonMessage()`，讓 Azure Service Bus 可重試

## Queue / Event Flow

目前實作三個 feature module：

1. `FundModule`
   - 啟動後定期產生 `FundDomainEventNotificationPayload`
   - 廣播到 `topic.fund.transaction.test` topic

2. `WebhookModule`
   - 接收 Fund transaction topic 的 domain event notification
   - 將 Fund event 轉成 `WebhookDeliveryPayload` snapshot
   - 用 in-memory store 模擬保存 delivery snapshot
   - 發送 `{ deliveryId }` 到 `webhook-delivery` queue

3. `DeliveryModule`
   - 接收 `webhook-delivery` queue 的 execution job
   - 透過 `deliveryId` 從 in-memory store 讀取 webhook payload snapshot
   - 使用 Nest Logger 印出收到的 `deliveryId` 與 payload event key

流程如下：

```text
FundModule
  -> topic.fund.transaction.test topic: FundDomainEventNotificationPayload
  -> WebhookModule subscription
  -> create WebhookDeliveryPayload snapshot
  -> webhook-delivery queue: WebhookDeliveryExecutionPayload
  -> DeliveryModule
  -> load payload snapshot by deliveryId
  -> Logger
```

## Pub/Sub Design Rules

### Session

Session 用來確保同一資源的更新事件維持 FIFO。本專案用 `${payload.resourceType}:${payload.resourceIdentifier}` 作為 session id，所以同一筆 deposit / withdrawal 的事件會被送進同一個 session，Azure Service Bus 同時間只會讓一個 receiver 處理該 session。

不同資源會進不同 session，因此仍可平行處理。這解決的是同一資源事件順序問題，不是全域 topic 順序。

### Subscription

同一個 microservice 的多個 instances 做水平擴充時，必須使用同一份 subscription。這樣同一筆 message 在該 subscription 內只會被其中一個 instance 取得並處理，避免每個 instance 都各自 handle 一次。

不同 microservice 如果都要收到同一筆 domain event，才需要各自建立不同 subscription。Topic 會把 message 複製到每個 subscription；subscription 內則是 competing consumers。

Azure Service Bus 是 at-least-once delivery，處理失敗、lock timeout、instance crash 或 complete 前中斷時，message 仍可能被重新投遞，所以正式服務仍需用 event id 或 resource event key 做 idempotency。

## Session Ordering

Fund transaction event 已啟用 Azure Service Bus sessions，用來確保同一資源的更新事件 FIFO。

目前 session 設定在 `FundModule` 和 `WebhookModule` 的 `EventModule.forRoot(...)`：

```ts
eventOptions<FundDomainEventNotificationPayload>(
  FUND_TRANSACTION_TOPIC,
  FUND_TRANSACTION_SUBSCRIPTION,
  true,
  {
    useSessions: true,
    sessionIdFactory: getFundTransactionSessionId,
  },
);
```

`getFundTransactionSessionId(...)` 使用同一資源的穩定 key：

```ts
`${payload.resourceType}:${payload.resourceIdentifier}`;
```

因此同一筆 deposit / withdrawal 的事件會進同一個 session，維持 FIFO；不同資源會進不同 session，可以由多個 service instances 平行處理。

Azure 上對應的 subscription 必須在建立時啟用 sessions，本 demo 預設使用：

```text
subscription.session.webhook.transaction.test
```

## Environment Variables

`.env` 已被 `.gitignore` 排除，不會進版控。請依照實際 Azure Service Bus 設定調整。

| Variable                              | Required | Default                                         | Description                                     |
| ------------------------------------- | -------- | ----------------------------------------------- | ----------------------------------------------- |
| `PORT`                                | No       | `3000`                                          | Nest HTTP server port                           |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Yes      | -                                               | Azure Service Bus connection string             |
| `FUND_TRANSACTION_TOPIC_NAME`         | No       | `topic.fund.transaction.test`                   | Fund domain event notification topic name       |
| `FUND_TRANSACTION_SUBSCRIPTION_NAME`  | No       | `subscription.session.webhook.transaction.test` | 此 app 用來訂閱 Fund topic 的 subscription name |
| `WEBHOOK_DELIVERY_QUEUE_NAME`         | Yes      | `webhook-delivery`                              | Webhook delivery execution queue name           |
| `FUND_PUBLISH_INTERVAL_MS`            | No       | `30000`                                         | FundModule 定期送出 domain event 的間隔毫秒     |

Example `.env`：

```env
PORT=3000
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=replace-with-your-key
FUND_TRANSACTION_TOPIC_NAME=topic.fund.transaction.test
FUND_TRANSACTION_SUBSCRIPTION_NAME=subscription.session.webhook.transaction.test
WEBHOOK_DELIVERY_QUEUE_NAME=webhook-delivery
FUND_PUBLISH_INTERVAL_MS=30000
```

## Azure Resources

專案不會自動建立 Azure resources。請先在 Azure Portal、Azure CLI 或 IaC 建好：

- Topic: `topic.fund.transaction.test`
- Session-enabled subscription under that topic: `subscription.session.webhook.transaction.test`
- Queue: `webhook-delivery`

Topic broadcast 的重點是每個獨立 consumer service 應該有自己的 subscription；多個 service 共用同一個 subscription 時會變成在同一個 subscription 內競爭消費。若需要 FIFO，subscription 必須啟用 sessions。

如果 resource 名稱不同，請同步修改 `.env`：

```env
FUND_TRANSACTION_TOPIC_NAME=your-fund-topic
FUND_TRANSACTION_SUBSCRIPTION_NAME=your-webhook-subscription
WEBHOOK_DELIVERY_QUEUE_NAME=your-delivery-queue
```

## Quick Start

1. 安裝依賴

```bash
npm install
```

2. 設定 `.env`

```env
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
FUND_TRANSACTION_TOPIC_NAME=topic.fund.transaction.test
FUND_TRANSACTION_SUBSCRIPTION_NAME=subscription.session.webhook.transaction.test
WEBHOOK_DELIVERY_QUEUE_NAME=webhook-delivery
```

目前 Fund transaction event 啟用了 Azure Service Bus sessions，請確認 Azure 上的 subscription 建立時已啟用 sessions。

3. 確認 Azure Service Bus topic、subscription 與 queue 已存在

```text
topic.fund.transaction.test
subscription.session.webhook.transaction.test
webhook-delivery
```

4. 啟動開發模式

```bash
npm run start:dev
```

5. 觀察 log

啟動後 `FundModule` 會先送出一筆 fund domain event，之後依 `FUND_PUBLISH_INTERVAL_MS` 週期送出。正常流程會看到類似 log：

```text
FundProducer Published deposit.completed ... to topic topic.fund.transaction.test
WebhookConsumer Created delivery ... for deposit.completed ...; published execution job to webhook-delivery
DeliveryConsumer Received delivery execution job ...; loaded deposit.completed payload for merchant ...; endpoint ...
```

## Validation

編譯：

```bash
npm run build
```

Lint：

```bash
npm run lint
```

測試：

```bash
npm test -- --runInBand
```

## Notes

- 本專案固定使用 Azure SDK，已移除 adapter 切換實作。
- Azure SDK 對 Azure Service Bus 原生 ack 行為控制較直接。
- Demo 沒有 DB persistence，因此用 in-memory store 模擬保存 `WebhookDeliveryPayload` snapshot；正式專案應在 DB commit delivery snapshot 後再發布 execution job。
- Feature module 不直接依賴 Azure SDK；work queue 依賴 `Queue<TPayload>`，domain event 依賴 `EventBus<TPayload>`，底層串接集中在 `src/queue` 與 `src/event`。
