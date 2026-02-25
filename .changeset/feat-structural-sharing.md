---
"@mearie/core": minor
"@mearie/svelte": minor
---

feat(cache): add structural sharing to preserve referential identity

`readQuery`, `readFragment`, and `readFragments` now use `replaceEqualDeep`
to compare new denormalized results against the previous read. Unchanged
subtrees keep their original object references, preventing unnecessary
reactive updates in consumer frameworks.

- Added `replaceEqualDeep` utility for recursive structural sharing
- Cache `extract()` / `hydrate()` now includes memoized results so
  SSR-hydrated reads return stable references from the first read
- Svelte bindings use `$state.raw` for query/subscription data to
  ensure reference-equal values skip signal updates
