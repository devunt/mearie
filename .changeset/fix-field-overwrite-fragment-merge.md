---
"@mearie/core": patch
---

fix(core): merge duplicate field selections instead of overwriting

When the same field key appeared multiple times in a query's selections (e.g., once via a `FragmentSpread` and once as a direct `Field` selection), the direct `Field` selection would overwrite the value previously merged from the fragment spread. This caused fields populated by fragment spreads to be silently dropped.

For example, if a fragment spread merges a field with richer sub-selections, and a subsequent direct field selection for the same key has fewer sub-selections, the richer data from the fragment spread would be lost.

Fixed by merging into the existing value when the same field alias already exists in `fields`, consistent with how `FragmentSpread` and `InlineFragment` selections are handled.
