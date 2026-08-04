# @mearie/svelte

## 0.5.0

### Minor Changes

- 49aae91: Enforce data ownership across variable changes in query, subscription and fragment hooks.

  Every result now belongs to exactly one operation key — the document plus its variables — and a hook only ever exposes values belonging to the key it is currently observing. Previously a query or subscription kept exposing the previous variables' `data` after `variables` changed, with `loading` catching up one flush later or, on synchronous cache hits, never observably at all; consumers could read data that did not belong to the current variables and had no way to detect it, so combining `data` and `loading` correctly was impossible. `data`, `error` and `metadata` are now derived from `(state, current key, skip)` rather than stored as independent imperative cells, so a key change releases all three in the same reactive moment `loading` becomes `true` — the reset is atomic by construction, and a late response for superseded variables can never be attributed to the current ones.

  Query and subscription results gain a `previousData` field. It holds the last non-`undefined` data from a prior key, skipping keys that ended without data — so it is not necessarily the variables you used immediately before, and if you return to a set of variables you used earlier it can carry that earlier result for the key you are on now. Read `data ?? previousData` to keep the current view on screen while the next one loads.

  The `Query` and `DefinedQuery` unions are widened to match: the `loading: true` arm now carries `data` (`DataOf<T> | undefined`, or `DataOf<T>` for `DefinedQuery`) and `error: AggregatedError | undefined`, and every arm gains `previousData`. This makes the types honest about `refetch()`, which keeps the current result — and any retained error — visible while it revalidates. Narrow on the field you actually need (`if (error)`, `if (data)`) rather than treating `loading: true` as proof that both are absent.

  Under `skip: true` a key change still releases the held result, but nothing executes and `loading` stays `false`. Subscriptions no longer report a stale `loading: true` after `skip` flips mid-flight.

  `initialData` is re-evaluated and attributed to the new key whenever variables change, including under `skip`. A seeded query therefore swaps atomically from the old value to the new one with no intermediate `undefined`, and `loading` stays `false` while the result is confirmed in the background. Because `initialData` must correspond to the current variables, reusing one `initialData` object across two different sets of variables logs a warning in development.

  Fragment hooks are keyed by ref identity — the ref's storage key plus that fragment's own arguments — falling back to ref content only when the ref carries no storage key. Immutable query data hands down a fresh ref object on any parent change; identity keying means those no longer force a resubscription, while a genuine ref transition resolves for the very reader that sees it (a render or derivation whose key no longer matches the emission reads through to the cache) instead of arriving one frame late. Ref transitions are atomic in the same sense as variable changes, and the synchronous initial-load contract is unchanged. React's `useFragment` moves off `useSyncExternalStore` to render-phase derivation, which is what makes the atomic ref transition possible there; its concurrent-rendering tearing guarantee no longer applies. One behavior change follows from the contract: a ref transition to an entity absent from the cache now throws `Fragment data not found` on read, where the hook previously kept serving the prior entity's data. The hook has no data it is allowed to serve, so the throw is deliberate rather than incidental.

  Subscriptions replace `data` wholesale on every event and never merge events into an accumulated value — collect history yourself in `onData` if you need it. `loading: true` means no event has arrived for the current variables yet, not that a request is in flight, so a stream that stays quiet after opening keeps reporting `loading: true`. `onData` and `onError` fire only on real emissions from the server; releasing `data` on a variables change is not an emission and never invokes either.

  `applyPatchesImmutable` and `applyPatchesMutable` are now generic over the target type and return `T | null | undefined`, so a root-level `set` patch that replaces the root is representable, and the observer passes a `null` emission through to `previousData` instead of reading it as "no data". No cache path currently reachable produces a root-null patch — these arms close a latent hole in the type and the derivation, not a user-visible bug.

  Re-execution is scoped to an explicit dependency set in every binding, each entry compared by value: query hooks depend on the observer key, `skip` and the `fetchPolicy` value; subscription hooks on the key and `skip`; fragment hooks on the key alone. Other reactive values read inside the `variables` or options thunks are read untracked at execution time and no longer re-trigger the operation, and passing a fresh object literal for unchanged variables no longer re-executes either. React's dependency arrays additionally carry the client and the artifact object, so a changed `ClientProvider` value re-executes there; the other bindings capture the client once at setup.

  The state machine itself lives in `@mearie/core`, which now exports the observer primitives (`computeObserverKey`, `initObserverState`, `beginFetch`, `acceptResult`, `acceptInitialData`, `trackInitialData`, `reduceObserverResult`, `reduceFragmentResult`, `deriveObserverView`, `readRefIdentity` and the accompanying types). All four bindings are thin shells over it, so the contract is identical everywhere while each keeps its native grain: Svelte `$state` + `$derived` + `$effect.pre`, React `useState` with render-phase derivation plus an isomorphic layout effect, Vue `shallowRef` + `computed` + an immediate pre-flush `watch` over enumerated sources, Solid `createStore`/`reconcile` + `createMemo` + `createComputed`. Fine-grained propagation is preserved in Svelte, Vue and Solid — per-field derived values mean a commit only wakes readers of the fields that actually changed; React keeps its component-level re-render model. In Solid's `createQuery`, `previousData` becomes a structural snapshot once the new key produces a result, because `reconcile` rewrites the previously committed node in place; `createSubscription` uses a plain signal rather than a store, since an event stream has no leaf-level granularity to preserve, so its `previousData` is carried by reference.

  If you relied on the old behavior of keeping previous data visible while the next variables load, switch to `data ?? previousData`.

### Patch Changes

- Updated dependencies [49aae91]
- Updated dependencies [ec201c7]
  - @mearie/core@0.8.0

## 0.4.8

### Patch Changes

- d51b495: Implement per-operation query fetch policies. Query options now carry `fetchPolicy` into operation metadata, and `cacheExchange` respects operation-level overrides before falling back to its configured default.
- Updated dependencies [7975124]
- Updated dependencies [a882622]
- Updated dependencies [8d41089]
- Updated dependencies [d51b495]
- Updated dependencies [17eca5d]
  - @mearie/core@0.7.0

## 0.4.7

### Patch Changes

- Updated dependencies [f90f1a9]
  - @mearie/core@0.6.7

## 0.4.6

### Patch Changes

- Updated dependencies [d879830]
  - @mearie/core@0.6.6

## 0.4.5

### Patch Changes

- Updated dependencies [c9e062a]
- Updated dependencies [d56d7c7]
- Updated dependencies [0b1c58b]
- Updated dependencies [2a66735]
- Updated dependencies [ae778c4]
  - @mearie/core@0.6.5

## 0.4.4

### Patch Changes

- Updated dependencies [5c8640d]
- Updated dependencies [aba3afe]
- Updated dependencies [6167b22]
  - @mearie/core@0.6.4

## 0.4.3

### Patch Changes

- Updated dependencies [ce331e8]
  - @mearie/core@0.6.3

## 0.4.2

### Patch Changes

- Updated dependencies [deb8154]
- Updated dependencies [adfa1a5]
  - @mearie/core@0.6.2

## 0.4.1

### Patch Changes

- Updated dependencies [c5cbd35]
  - @mearie/core@0.6.1

## 0.4.0

### Minor Changes

- bf327e2: feat(cache): patch-based fine-grained reactivity

  Replace the "full denormalize on every change" model with a patch-based update system. The cache now emits targeted `Patch` mutations instead of triggering a full re-denormalize, enabling field-level reactivity in Solid, Svelte, and Vue.

  **New exports from `@mearie/core`:**
  - `Patch` — union type describing a targeted cache mutation (`set`, `splice`, `swap`)
  - `PropertyPath` — path into a denormalized result tree (`(string | number)[]`)
  - `setPath(obj, path, value)` — sets a value at a path in a nested object
  - `getPath(obj, path)` — reads a value at a path from a nested object

  **Framework binding changes:**
  - **Solid**: switches from `createSignal` to `createStore`, enabling fine-grained property-level reactivity
  - **Svelte 5**: switches from `$state.raw` to `$state` (deep proxy), enabling fine-grained reactivity
  - **Vue**: wraps data in `reactive()` for deep dependency tracking
  - **React**: applies patches via shallow-copy path traversal (`applyPatchesImmutable`) instead of full replacement

  **Performance improvements:**
  - Microtask batching removed — patch delivery is now synchronous
  - Scalar field changes are O(1) per patch instead of O(query size)
  - Entity reference changes trigger partial re-denormalize only for the affected subtree
  - List changes use keyed diff (common prefix/suffix + selection-sort swaps) to minimize reactive notifications

### Patch Changes

- a85583b: fix(svelte): prevent unnecessary fragment resubscription caused by `$state.snapshot` dependency tracking

  `$state.snapshot()` deep-reads all properties of the `$state` proxy, creating reactive dependencies on every field of the fragment ref inside `$effect`. This caused any field change (e.g., `order` during reorder) to re-trigger the effect, tearing down and recreating the subscription, losing patch-based updates and cascading full replacements to all downstream components. Wrapping in `untrack()` limits the `$effect` to only track the `fragmentRef()` accessor.

- Updated dependencies [bf327e2]
- Updated dependencies [499dc8d]
  - @mearie/core@0.6.0

## 0.3.5

### Patch Changes

- 7043953: Fix `skip` option not setting `loading` to `false` when activated, and `refetch()` not executing when `skip` is `true`

## 0.3.4

### Patch Changes

- Updated dependencies [1d541c5]
- Updated dependencies [93b52da]
  - @mearie/core@0.5.2

## 0.3.3

### Patch Changes

- Updated dependencies [97b17bc]
  - @mearie/core@0.5.1

## 0.3.2

### Patch Changes

- 1259c13: feat(core): add optimistic update support for mutations

  Mutations can now include an `optimisticResponse` in metadata to immediately reflect expected changes in the cache before the network response arrives. On success, the optimistic data is replaced with the actual server response; on error, the cache rolls back to its previous state.

  Usage:

  ```ts
  await execute(variables, {
    metadata: {
      cache: {
        optimisticResponse: { updateUser: { __typename: 'User', id: '1', name: 'Alice' } },
      },
    },
  });
  ```

  - `OperationMetadataMap` and `MutationOptions` are now generic, enabling type-safe `optimisticResponse` tied to `DataOf<T>`
  - Cache uses independent optimistic layers per mutation for correct concurrent handling
  - Framework bindings (React, Vue, Solid, Svelte) propagate the generic to their mutation option types

- Updated dependencies [eb98bb5]
- Updated dependencies [f36f49a]
- Updated dependencies [cacc553]
- Updated dependencies [1259c13]
  - @mearie/core@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [c5af823]
  - @mearie/core@0.4.0

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
