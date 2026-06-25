# Nest Service Bus Demo

這個專案示範在 NestJS 中整合 Azure Service Bus queue，並透過 `QueueModule` 封裝 queue 操作，讓 feature module 只依賴簡單的 `send` / `receive` 介面。

`QUEUE_MODE` 可切換兩種底層實作：

- `azure-sdk`：直接使用 Azure 官方 SDK `@azure/service-bus`。
- `nest-js-tools`：使用 `@nestjstools/messaging` 與 `@nestjstools/messaging-azure-service-bus-extension`。

## Architecture

主要 queue abstraction 位於 `src/queue`：

```ts
export interface Queue<TPayload = unknown> {
  send(payload: TPayload): Promise<void>;
  receive(handler: QueueMessageHandler<TPayload>): Promise<void>;
}
```

Feature module 透過 `QueueModule.forRoot(...)` 註冊 queue，並用 `@InjectQueue(queueName)` 注入泛型 queue。實際專案中會透過 `queueOptions()` 從環境變數組出參數：

```ts
QueueModule.forRoot(queueOptions(FUND_TRANSACTION_QUEUE))
```

```ts
constructor(
  @InjectQueue(FUND_TRANSACTION_QUEUE)
  private readonly queue: Queue<FundDomainEventNotificationPayload>,
) {}
```

## Payload Contracts

Payload 型別集中在 `src/features/queue-payloads.ts`，目前對齊 webhook design draft 的三個概念。

### Domain Event Notification

`fund-transaction` queue 承載 Fund service 發出的 domain event notification：

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

## Mode Behavior

### azure-sdk

`azure-sdk` mode 直接使用 Azure SDK：

- `ServiceBusClient.createSender(queueName)` 發送 message
- `ServiceBusClient.createReceiver(queueName).subscribe(...)` 接收 message
- handler 成功後 `completeMessage()`
- handler 失敗時 `abandonMessage()`，讓 Azure Service Bus 可重試

### nest-js-tools

`nest-js-tools` mode 會在 AppModule 啟動時條件式載入 NestJSTools MessagingModule：

- 每個 queue 建立一組獨立 bus/channel
- bus name 格式：`queue.bus:<queueName>`
- channel name 格式：`queue.channel:<queueName>`
- routing key 使用 queue name，例如 `fund-transaction`

這樣 `fund-transaction` 和 `webhook-delivery` 不會共用同一個 bus，避免 dispatch 時同時送到多個 queue。

## Queue Flow

目前實作三個 feature module：

1. `FundModule`
   - 啟動後定期產生 `FundDomainEventNotificationPayload`
   - 發送到 `fund-transaction` queue

2. `WebhookModule`
   - 接收 `fund-transaction` queue 的 domain event notification
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
  -> fund-transaction queue: FundDomainEventNotificationPayload
  -> WebhookModule
  -> create WebhookDeliveryPayload snapshot
  -> webhook-delivery queue: WebhookDeliveryExecutionPayload
  -> DeliveryModule
  -> load payload snapshot by deliveryId
  -> Logger
```

## Environment Variables

`.env` 已被 `.gitignore` 排除，不會進版控。請依照實際 Azure Service Bus 設定調整。

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | Nest HTTP server port |
| `QUEUE_MODE` | No | `azure-sdk` | Queue adapter mode，可用 `azure-sdk` 或 `nest-js-tools` |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Yes | - | Azure Service Bus connection string |
| `FUND_TRANSACTION_QUEUE_NAME` | Yes | `fund-transaction` | Fund domain event notification queue name |
| `WEBHOOK_DELIVERY_QUEUE_NAME` | Yes | `webhook-delivery` | Webhook delivery execution queue name |
| `FUND_PUBLISH_INTERVAL_MS` | No | `30000` | FundModule 定期送出 domain event 的間隔毫秒 |
| `MESSAGING_DEBUG` | No | `false` | 只在 `QUEUE_MODE=nest-js-tools` 時使用，控制 NestJSTools debug log |

Example `.env`：

```env
PORT=3000

QUEUE_MODE=azure-sdk
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=replace-with-your-key
FUND_TRANSACTION_QUEUE_NAME=fund-transaction
WEBHOOK_DELIVERY_QUEUE_NAME=webhook-delivery
FUND_PUBLISH_INTERVAL_MS=30000

MESSAGING_DEBUG=false
```

## Azure Resources

專案不會自動建立 queue。請先在 Azure Portal、Azure CLI 或 IaC 建好：

- `fund-transaction`
- `webhook-delivery`

如果 queue 名稱不同，請同步修改 `.env`：

```env
FUND_TRANSACTION_QUEUE_NAME=your-fund-queue
WEBHOOK_DELIVERY_QUEUE_NAME=your-delivery-queue
```

## Quick Start

1. 安裝依賴

```bash
npm install
```

2. 設定 `.env`

```env
QUEUE_MODE=azure-sdk
AZURE_SERVICE_BUS_CONNECTION_STRING=Endpoint=sb://...
FUND_TRANSACTION_QUEUE_NAME=fund-transaction
WEBHOOK_DELIVERY_QUEUE_NAME=webhook-delivery
```

若要測 NestJSTools adapter，改成：

```env
QUEUE_MODE=nest-js-tools
```

3. 確認 Azure Service Bus queue 已存在

```text
fund-transaction
webhook-delivery
```

4. 啟動開發模式

```bash
npm run start:dev
```

5. 觀察 log

啟動後 `FundModule` 會先送出一筆 fund domain event，之後依 `FUND_PUBLISH_INTERVAL_MS` 週期送出。正常流程會看到類似 log：

```text
FundProducer Sent deposit.completed ... to fund-transaction
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

- `QUEUE_MODE` 只支援 `azure-sdk` 與 `nest-js-tools`；若設定成其他值，啟動時會直接丟出 `Unsupported QUEUE_MODE`。
- `azure-sdk` mode 對 Azure Service Bus 原生 ack 行為控制較直接。
- `nest-js-tools` mode 保留 message bus/decorator abstraction，並透過 queue name 作為 routing key。
- Demo 沒有 DB persistence，因此用 in-memory store 模擬保存 `WebhookDeliveryPayload` snapshot；正式專案應在 DB commit delivery snapshot 後再發布 execution job。
- Feature module 不直接依賴 Azure SDK 或 NestJSTools，只依賴 `Queue<TPayload>`，因此可以用環境變數切換底層實作。