---
'@mearie/core': patch
---

Notify subscribers when a singular entity link field is replaced by a different entity. Previously, for fields with sub-selections where both the old and new values were non-null, normalize skipped the accessor callback whenever the normalized value was an entity link — so replacing the link updated storage silently: no field change was recorded, structural patches never reached subscribers, and the stale flag set by invalidate was never cleared. Arrays of links and null transitions were unaffected, which is why only singular link swaps were broken. The accessor is now always invoked for non-null nested selection writes; the equality guards in writeQuery/writeOptimistic already suppress spurious change records.
