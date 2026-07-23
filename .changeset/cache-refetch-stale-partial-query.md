---
'@mearie/core': patch
---

Refetch stale queries after invalidation even when the cached query is partial. The cache exchange decided whether to refetch by re-reading the query and checking the derived stale flag, but readQuery returns { data: null, stale: false } for partial results — so once a subscribed query became unreadable from cache (e.g. a link was rewritten to an entity with fewer cached fields), invalidate could never trigger a refetch, which is exactly when the network is needed most. The stale notification listener now consults the subscription's own stale flag via cache.isStale and refetches regardless of readability, emitting the cached data alongside only when it is still complete.
