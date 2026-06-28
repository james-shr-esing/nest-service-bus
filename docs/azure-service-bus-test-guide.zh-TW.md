# Azure Service Bus 四個情境測試指南

這份文件用目前專案的 demo flow 來測：

```text
FundProducer -> fund transaction topic/subscription -> WebhookConsumer -> webhook delivery queue -> DeliveryConsumer
```

請使用 `USE_PACKAGE=azure-sdk`。目前 fund transaction event 有啟用 Azure Service Bus sessions，`nest-js-tools` 模式在本專案中不支援 session receiver。

## 共用前置設定

每個終端機都先設定這些環境變數，連到同一組 Azure Service Bus resources：

```powershell
$env:USE_PACKAGE = 'azure-sdk'
$env:AZURE_SERVICE_BUS_CONNECTION_STRING = 'Endpoint=sb://...'
$env:FUND_TRANSACTION_TOPIC_NAME = 'topic.fund.transaction.test'
$env:FUND_TRANSACTION_SUBSCRIPTION_NAME = 'subscription.session.webhook.transaction.test'
$env:WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook.delivery.test'
```

Azure resources 需要先存在：

- Topic: `topic.fund.transaction.test`
- Subscription: `subscription.session.webhook.transaction.test`
- Queue: `webhook.delivery.test`

如果要測 session，subscription 需要啟用 session。這個專案的 session id 是：

```text
${resourceType}:${resourceIdentifier}
```

所以同一筆 deposit 的多個狀態事件，只要 `resourceIdentifier` 相同，就會落在同一個 session。

## 情境 1：多個 Instance 共用同一組 Subscription

目的：確認同一個 topic subscription 下，多個 app instance 是 competing consumers；同一筆 message 不會廣播給每個 instance 各一份。

終端機 A：

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'app-a'
$env:FUND_PUBLISH_INTERVAL_MS = '5000'
$env:FUND_STATUS_FLOW_MODE = 'off'
npm run start:dev
```

終端機 B：

```powershell
$env:PORT = '3002'
$env:INSTANCE_ID = 'app-b'
$env:FUND_PUBLISH_INTERVAL_MS = '5000'
$env:FUND_STATUS_FLOW_MODE = 'off'
npm run start:dev
```

觀察 log：

```text
WebhookConsumer [app-a] Received deposit.completed ...
WebhookConsumer [app-b] Received deposit.completed ...
```

判斷方式：

- 同一個 `resourceIdentifier` 正常情況只會被其中一個 instance 收到。
- 若發生 retry、lock timeout、instance crash，Azure Service Bus 是 at-least-once delivery，所以仍可能重複投遞。
- 注意：目前 `FundModule` 在每個 app instance 都會啟動，所以 A/B 都會各自產生事件。

補充限制：`WebhookDeliveryStoreService` 是 in-memory。多 instance 測試時，A 寫入 delivery snapshot 後，queue job 可能被 B 消費，B 會查不到 A memory 裡的 snapshot。正式服務要改成 shared DB。

## 情境 2：Queue Handler 失敗後 Retry

目的：確認 queue message 在 handler throw error 時不會 complete，會被重新投遞。

單一終端機執行：

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'retry-a'
$env:FUND_PUBLISH_INTERVAL_MS = '10000'
$env:FUND_STATUS_FLOW_MODE = 'off'
$env:WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS = '1'
npm run start:dev
```

觀察 log：

```text
DeliveryConsumer [retry-a] Received delivery job ... localAttempt=1
DeliveryConsumer [retry-a] Throwing test error ...
AzureSdkQueue:webhook.delivery.test error ...
DeliveryConsumer [retry-a] Received delivery job ... localAttempt=2
DeliveryConsumer DB update webhook_delivery ... status=SUCCESS
```

判斷方式：

- 第一次 delivery job 會故意 throw。
- `AzureSdkQueueService` 會呼叫 `abandonMessage()`。
- 同一筆 queue message 會重新回到 queue。
- 第二次成功後才會 `completeMessage()`，message 才會被移除。

如果 `WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS` 設得比 queue 的 `maxDeliveryCount` 高，message 最後會進 dead-letter queue。

## 情境 3：Long Job 處理中又有新 Event

目的：確認 event handler 很慢時，新事件會如何被處理；同 session 會排隊，不同 session 可由其他 instance 處理。

### 3A. 同 Session Long Job

單一終端機執行：

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'long-a'
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '3'
$env:FUND_FIXED_RESOURCE_IDENTIFIER = 'deposit-long-job-001'
$env:FUND_STATUS_FLOW_MODE = 'off'
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '10000'
$env:FUND_PUBLISH_INTERVAL_MS = '60000'
npm run start:dev
```

判斷方式：

- 三筆 event 都使用同一個 `resourceIdentifier`。
- 也就是同一個 session。
- `WebhookConsumer` 每筆會 delay 10 秒。
- 預期會一筆處理完，下一筆才進來。

### 3B. 不同 Session Long Job

單一終端機執行：

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'long-a'
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '3'
$env:FUND_FIXED_RESOURCE_IDENTIFIER = ''
$env:FUND_STATUS_FLOW_MODE = 'off'
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '10000'
$env:FUND_PUBLISH_INTERVAL_MS = '60000'
npm run start:dev
```

判斷方式：

- 每筆 event 都會產生不同 `resourceIdentifier`。
- 也就是不同 session。
- 單一 instance 下，本專案目前只有一個 session pump，所以仍會偏序列處理。
- 多 instance 下，不同 session 可以被不同 instance 接走。

## 情境 4：Session FIFO 狀態流

目的：確認同一筆交易的多個狀態事件，在同一個 session 中會依序被 subscriber 收到。

狀態順序：

```text
1 prepare
2 reviewing
3 processing
4 processed
5 completed
```

執行：

```powershell
$env:PORT = '3001'
$env:INSTANCE_ID = 'fifo-seq'
$env:FUND_STATUS_FLOW_MODE = 'sequential'
$env:FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = 'deposit-fifo-001'
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '3000'
$env:FUND_PUBLISH_INTERVAL_MS = '0'
npm run start:dev
```

預期接收順序：

```text
WebhookConsumer [fifo-seq] Received deposit.prepare status=prepare deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.reviewing status=reviewing deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.processing status=processing deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.processed status=processed deposit-fifo-001
WebhookConsumer [fifo-seq] Received deposit.completed status=completed deposit-fifo-001
```

更能證明 session 的測法：

1. 同樣設定 `FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = 'deposit-fifo-001'`。
2. 設定 `WEBHOOK_EVENT_PROCESSING_DELAY_MS = '10000'`。
3. 開兩個 app instance，共用同一個 subscription。
4. 觀察同一筆 `deposit-fifo-001` 不會在第一筆還沒 complete 時，被另一個 instance 處理第二筆。

如果同一個交易的五筆狀態都照順序進入同一個 consumer，且 long handler 期間沒有被其他 instance 插隊處理，就代表 session lock/FIFO 正在發揮作用。

## 測完後建議清理

每次切換情境前，建議：

- 停掉所有 `npm run start:dev`。
- 確認 PowerShell env 沒有殘留不想要的值。
- 必要時清掉 queue/subscription 中舊 message，避免前一次測試的 message 影響判斷。

常用重設：

```powershell
$env:FUND_STATUS_FLOW_MODE = 'off'
$env:FUND_STATUS_FLOW_RESOURCE_IDENTIFIER = ''
$env:FUND_FIXED_RESOURCE_IDENTIFIER = ''
$env:FUND_PUBLISH_ON_BOOTSTRAP_COUNT = '1'
$env:FUND_PUBLISH_INTERVAL_MS = '30000'
$env:WEBHOOK_EVENT_PROCESSING_DELAY_MS = '0'
$env:WEBHOOK_DELIVERY_FAIL_FIRST_ATTEMPTS = '0'
$env:WEBHOOK_DELIVERY_PROCESSING_DELAY_MS = '0'
```

