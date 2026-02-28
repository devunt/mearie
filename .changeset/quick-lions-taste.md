---
'@mearie/core': patch
---

Fix cache invalidation behavior for query and fragment subscriptions.

When invalidating an entity, the cache now notifies query subscribers that depend on links to that entity (including fragment-only query selections), so query refetch is triggered correctly. During invalidation/refetch, previously resolved query and fragment results are kept as stale data instead of emitting transient `null` values.
