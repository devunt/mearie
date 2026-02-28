# @mearie/svelte

## 0.3.0

### Minor Changes

- cda1217: Expose `metadata` from all framework binding hooks (query, mutation, subscription, fragment)

### Patch Changes

- 1b248b5: Add snapshot release support
- Updated dependencies [1b248b5]
- Updated dependencies [c7f0cea]
  - @mearie/core@0.3.0

## 0.2.6

### Patch Changes

- Updated dependencies [16eeca9]
  - @mearie/core@0.2.4

## 0.2.5

### Patch Changes

- Updated dependencies [0295683]
- Updated dependencies [67df131]
  - @mearie/core@0.2.3

## 0.2.4

### Patch Changes

- Updated dependencies [293d42f]
  - @mearie/core@0.2.2

## 0.2.3

### Patch Changes

- 1b69f96: fix(svelte): ship type-stripped `.svelte.js` files for `svelte` export condition

  The `svelte` export condition now points to `dist/svelte/*.svelte.js` files
  (TypeScript types stripped, Svelte runes preserved) instead of raw `.svelte.ts` source.
  This fixes `vite-plugin-svelte`'s dep optimizer failing to parse TypeScript syntax
  during dependency pre-bundling.

## 0.2.2

### Patch Changes

- b840766: fix: add `svelte` export condition for proper rune compilation

  Add `svelte` export condition to `publishConfig.exports` pointing to source `.svelte.ts` files.
  This allows `vite-plugin-svelte` to compile runes (`$state`, `$effect`, etc.) directly,
  fixing the `rune_outside_svelte` error when consuming the package in Svelte projects.

## 0.2.1

### Patch Changes

- f391689: fix: correct publishConfig exports to match tsdown output extensions

  `tsdown` outputs `.mjs`/`.cjs` files with `.d.mts`/`.d.cts` type declarations,
  but `publishConfig.exports` was referencing `.js`/`.d.ts` files that do not exist.
  TypeScript with `moduleResolution: bundler` follows the `exports` field directly,
  so it failed to resolve types for all published packages.

  Updated all `publishConfig.exports` to use nested `import`/`require` conditions
  with the correct `.mjs`/`.d.mts` and `.cjs`/`.d.cts` extensions respectively.

- Updated dependencies [f391689]
  - @mearie/core@0.2.1

## 0.2.0

### Minor Changes

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

- 647e6f5: fix(svelte): use $state.snapshot when passing fragment refs to executeFragment

  Fragment refs passed to `createFragment` could be Svelte 5 reactive proxies
  when the parent component stores them in `$state`. Passing a proxy directly to
  `executeFragment` caused serialization issues. Wrapping with `$state.snapshot`
  converts the proxy to a plain object before it is handed to the client.

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
