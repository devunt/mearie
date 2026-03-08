---
"@mearie/core": minor
---

Add `signal` option to `QueryOptions` and `MutationOptions` for cancelling in-flight operations via `AbortController`. When a signal aborts, the operation stream completes and a teardown event is sent to exchanges for proper cleanup. The promise-based `query()` and `mutation()` methods throw `signal.reason` on abort.

Also fixes `takeUntil` to complete downstream before unsubscribing from the source, matching RxJS semantics. This ensures `finalize` callbacks (like teardown dispatch) run while the upstream is still active.
