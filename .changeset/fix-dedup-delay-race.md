---
"@mearie/core": patch
---

Fix race condition in dedupExchange where `delay(0)` allowed torn-down operations to leak through to downstream exchanges, causing duplicate cache subscriptions and double patch delivery.
