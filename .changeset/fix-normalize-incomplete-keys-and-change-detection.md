---
"@mearie/core": patch
---

fix(core): skip normalization for entities with incomplete keys and detect inline field changes

Entities whose key fields are `undefined`, `null`, or only partially present
are now skipped during normalization instead of being stored under an empty
or partial cache key (e.g. `User:` or `Comment:post-1:`), preventing
orphaned records from accumulating in the cache.

Inline (non-entity) field values such as scalar arrays are now compared with
a deep equality check after normalization. Subscriptions are notified
whenever the stored value changes, including cases such as array reordering
that previously went undetected.
