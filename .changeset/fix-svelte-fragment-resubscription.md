---
"@mearie/svelte": patch
---

fix(svelte): prevent unnecessary fragment resubscription caused by `$state.snapshot` dependency tracking

`$state.snapshot()` deep-reads all properties of the `$state` proxy, creating reactive dependencies on every field of the fragment ref inside `$effect`. This caused any field change (e.g., `order` during reorder) to re-trigger the effect, tearing down and recreating the subscription, losing patch-based updates and cascading full replacements to all downstream components. Wrapping in `untrack()` limits the `$effect` to only track the `fragmentRef()` accessor.
