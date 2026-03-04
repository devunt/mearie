---
"@mearie/core": patch
---

fix(core): prevent downstream exceptions from killing subscription transport

Wrap `observer.next()` in the subscription exchange's next handler with try-catch to prevent downstream exceptions (e.g., cache patch errors) from propagating back into the transport client and killing the WebSocket connection. Caught exceptions are re-emitted as `ExchangeError` results so `onError` callbacks are still invoked. Also adds automatic re-subscribe on transport errors with teardown support.
