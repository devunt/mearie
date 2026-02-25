# @mearie/vue

## 0.2.0

### Minor Changes

- f1e23f5: Add `initialData` support to `QueryOptions` and framework bindings.
- bc37314: Add `DefinedQuery` type with `initialData` overload for framework bindings.
- be4719c: Add `FragmentList` type and array overload to fragment composables. `createFragment`/`useFragment` now accept an array of fragment references and return `FragmentList<T>` with a `data: DataOf<T>[]` field.
- 2921a09: Add `OptionalFragment` type and null/undefined overload to fragment composables. `createFragment`/`useFragment` now accept a nullable fragment reference and return `OptionalFragment<T>` with a `data: DataOf<T> | null` field.

### Patch Changes

- 6078bbb: fix: start background fetch when initialData is provided

  When `initialData` was supplied, the query hook would return it immediately
  and never subscribe to the server—so the data was never refreshed. The hook
  now sets `loading: true` and starts the subscription on mount, allowing
  `initialData` to be displayed while a fresh response is in-flight.

- 9292370: fix: add missing `take(1)` before `collect` in `createMutation`/`useMutation`

  `executeMutation` returns a stream derived from the long-lived `results$` subject, which never completes on its own. Without `take(1)`, `collect` waits for `complete()` indefinitely, causing the mutation promise to never resolve. `client.mutation()` in core already had `take(1)`, but all framework bindings were missing it.

- Updated dependencies [02eca8a]
- Updated dependencies [27565e9]
- Updated dependencies [9fbbcd3]
- Updated dependencies [0d8e311]
- Updated dependencies [73f1cb1]
- Updated dependencies [4b59e1a]
- Updated dependencies [bb435e0]
- Updated dependencies [1c59688]
- Updated dependencies [b8ffb3b]
- Updated dependencies [995e413]
- Updated dependencies [b9a5b20]
- Updated dependencies [b1b67f8]
- Updated dependencies [f1e23f5]
- Updated dependencies [f68fb70]
- Updated dependencies [be4719c]
- Updated dependencies [3a476ab]
- Updated dependencies [d7a08a9]
- Updated dependencies [ccfabf9]
  - @mearie/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [bcdaaf5]
  - @mearie/core@0.1.2

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages

### Patch Changes

- Updated dependencies [cf2f4e0]
  - @mearie/core@0.1.0
