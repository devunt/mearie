---
"@mearie/core": minor
---

Replace destructive cache invalidation with stale-marking strategy

- `invalidate()` now marks cache entries as stale instead of deleting them, preserving data for display during refetch
- `readQuery()`, `readFragment()`, and `readFragments()` return `{ data, stale }` instead of raw data, where `stale` indicates whether any accessed field or entity has been invalidated
- `writeQuery()` clears stale markers for written fields and notifies subscribers even when data values are unchanged
- Add `OperationResultMetadataMap` type augmentation interface for exchange-specific result metadata
- Cache exchange emits stale results via `result.metadata.cache.stale` using the new `OperationResultMetadataMap` augmentation, replacing the previous top-level `stale` field on `OperationResult`
- `subscribeQuery()` now tracks dependencies through `FragmentSpread` selections, ensuring invalidation of fragment-referenced entities correctly notifies query subscribers
