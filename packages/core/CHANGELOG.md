# @mearie/core

## 0.2.0

### Minor Changes

- 02eca8a: feat(core): add cache extract/hydrate and client maybeExtension

  `cacheExchange` now exposes `extract()` and `hydrate()` on its extension,
  allowing the normalized cache to be serialized to a plain object and later
  restored—useful for SSR hydration. The opaque `CacheSnapshot` type is
  exported from `@mearie/core`.

  `Client` gains a `maybeExtension()` method that returns the extension or
  `undefined` (rather than throwing) when the exchange is not present.

- 27565e9: feat(core): add operation metadata passthrough and subscription transport routing

  Add `metadata` field to `QueryOptions`, `MutationOptions`, `SubscriptionOptions`,
  and `FragmentOptions`, allowing users to pass exchange-specific metadata at
  execution time. The metadata is forwarded through `createOperation` into the
  operation object consumed by the exchange pipeline.

  The `subscriptionExchange` now accepts `metadata.subscription.transport: true`
  to route query/mutation operations through the subscription transport (e.g.
  graphql-ws, graphql-sse) instead of the default HTTP exchange.

- 9fbbcd3: feat(cache): add structural sharing to preserve referential identity

  `readQuery`, `readFragment`, and `readFragments` now use `replaceEqualDeep`
  to compare new denormalized results against the previous read. Unchanged
  subtrees keep their original object references, preventing unnecessary
  reactive updates in consumer frameworks.
  - Added `replaceEqualDeep` utility for recursive structural sharing
  - Cache `extract()` / `hydrate()` now includes memoized results so
    SSR-hydrated reads return stable references from the first read
  - Svelte bindings use `$state.raw` for query/subscription data to
    ensure reference-equal values skip signal updates

- b1b67f8: Introduce exchange extension system with named exchanges. All exchanges now return `{ name, io }` objects instead of bare `ExchangeIO` functions, enabling exchanges to expose public APIs via extensions.
- f1e23f5: Add `initialData` support to `QueryOptions` and framework bindings.
- f68fb70: Add cache invalidation support.
- be4719c: Add `FragmentList` type and array overload to fragment composables. `createFragment`/`useFragment` now accept an array of fragment references and return `FragmentList<T>` with a `data: DataOf<T>[]` field.
- 3a476ab: Add promise-based `query()` and `mutation()` methods to `Client` for simpler one-shot operations without manual stream handling.
- d7a08a9: Support custom fetch function in `httpExchange`.
- ccfabf9: Add `@required` directive support with `THROW` and `CASCADE` actions for client-side null handling. `THROW` throws `RequiredFieldError` when a required field is null; `CASCADE` propagates null to the nearest nullable ancestor.

### Patch Changes

- 0d8e311: fix(core): merge cache arrays element-wise in mergeFields

  Arrays in the normalized cache were always overwritten last-write-wins. Now
  they are merged element-by-element so that partial fragment selections (e.g.
  `sites { id }` alongside `sites { id name }`) retain sub-object fields from
  all selections rather than discarding them.

- 73f1cb1: fix(core): propagate error-only query results through cacheExchange

  When a cache-first query received an error response with no data (`data: null, errors: [...]`), the `forward$` filter silently discarded the result (intended only for successful responses to be read from cache). Since no data was written to cache, the `cache$` subscription never fired either, causing the error to be completely lost. Queries would hang indefinitely without emitting an error.

  Allow results with errors to pass through the `forward$` filter regardless of fetch policy.

- 4b59e1a: fix(core): merge duplicate field selections instead of overwriting

  When the same field key appeared multiple times in a query's selections (e.g., once via a `FragmentSpread` and once as a direct `Field` selection), the direct `Field` selection would overwrite the value previously merged from the fragment spread. This caused fields populated by fragment spreads to be silently dropped.

  For example, if a fragment spread merges a field with richer sub-selections, and a subsequent direct field selection for the same key has fewer sub-selections, the richer data from the fragment spread would be lost.

  Fixed by merging into the existing value when the same field alias already exists in `fields`, consistent with how `FragmentSpread` and `InlineFragment` selections are handled.

- bb435e0: Fix fragment cache collision where different fragments for the same entity overwrote each other's data when selecting the same nested object field with different sub-fields
- 1c59688: fix(core): use deep merge for fragment spread fields in scalar parsing and required validation

  Fragment spreads that select the same nested object field with fewer sub-selections (e.g., a root-level fragment selecting `me { id }` when the direct field selects `me { id, name, email, sites, ... }`) would overwrite the full object due to `Object.assign` performing a shallow merge. This caused fields like `sites`, `name`, and `email` to be lost from the query result.

  Replaced `Object.assign` with a recursive `deepAssign` that merges objects field-by-field and arrays element-by-element, preserving all fields from both direct selections and fragment spreads.

- b8ffb3b: fix(core): skip normalization for entities with incomplete keys and detect inline field changes

  Entities whose key fields are `undefined`, `null`, or only partially present
  are now skipped during normalization instead of being stored under an empty
  or partial cache key (e.g. `User:` or `Comment:post-1:`), preventing
  orphaned records from accumulating in the cache.

  Inline (non-entity) field values such as scalar arrays are now compared with
  a deep equality check after normalization. Subscriptions are notified
  whenever the stored value changes, including cases such as array reordering
  that previously went undetected.

- 995e413: fix(core): fix required validation for multiple fragments selecting same object field

  The same structural bug as in scalar parsing existed in `validateRequired`:
  when two fragment spreads selected the same object field with different
  `@required` sub-fields, the `validated` Set caused all but the first
  fragment's sub-fields to be skipped without checking their `@required`
  constraints.

  Applied the same `WeakMap<object, Set<string>>` fix: object fields are always
  recursed into without parent-level tracking, while leaf field validation is
  deduplicated per object instance.

- b9a5b20: fix(core): fix scalar parsing for multiple fragments selecting same object field

  When two or more fragment spreads both selected the same object field but with
  different sub-fields (e.g. Fragment1 selecting `user { createdAt }` and
  Fragment2 selecting `user { updatedAt }`), the `parsed` Set at the parent
  level caused the second fragment's sub-fields to be skipped entirely, leaving
  scalar values (such as DateTime) un-transformed.

  Fixed by switching from a flat `Set<string>` to a `WeakMap<object, Set<string>>`
  that tracks parsed fields per object instance. Object fields are no longer
  added to the parent's tracking set; only scalar leaf fields are, so subsequent
  fragments can recurse into the same object and process their own sub-fields.

- Updated dependencies [7a7f7d6]
- Updated dependencies [ccfabf9]
  - @mearie/shared@0.2.0

## 0.1.2

### Patch Changes

- bcdaaf5: fix(core): tsdown build output path for stream entry point

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages

### Patch Changes

- Updated dependencies [cf2f4e0]
  - @mearie/shared@0.1.0
