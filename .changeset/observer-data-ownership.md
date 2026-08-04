---
'@mearie/core': minor
'@mearie/svelte': minor
'@mearie/react': minor
'@mearie/vue': minor
'@mearie/solid': minor
---

Enforce data ownership across variable changes in query, subscription and fragment hooks.

Every result now belongs to exactly one operation key — the document plus its variables — and a hook only ever exposes values belonging to the key it is currently observing. Previously a query or subscription kept exposing the previous variables' `data` after `variables` changed, with `loading` catching up one flush later or, on synchronous cache hits, never observably at all; consumers could read data that did not belong to the current variables and had no way to detect it, so combining `data` and `loading` correctly was impossible. `data`, `error` and `metadata` are now derived from `(state, current key, skip)` rather than stored as independent imperative cells, so a key change releases all three in the same reactive moment `loading` becomes `true` — the reset is atomic by construction, and a late response for superseded variables can never be attributed to the current ones.

Query and subscription results gain a `previousData` field. It holds the last non-`undefined` data from a _prior_ key — never an earlier value of the current one — and it skips keys that ended without data, so it is not necessarily the variables you used immediately before. Read `data ?? previousData` to keep the current view on screen while the next one loads.

The `Query` and `DefinedQuery` unions are widened to match: the `loading: true` arm now carries `data` (`DataOf<T> | undefined`, or `DataOf<T>` for `DefinedQuery`) and `error: AggregatedError | undefined`, and every arm gains `previousData`. This makes the types honest about `refetch()`, which keeps the current result — and any retained error — visible while it revalidates. Narrow on the field you actually need (`if (error)`, `if (data)`) rather than treating `loading: true` as proof that both are absent.

Under `skip: true` a key change still releases the held result, but nothing executes and `loading` stays `false`. Subscriptions no longer report a stale `loading: true` after `skip` flips mid-flight.

`initialData` is re-evaluated and attributed to the new key whenever variables change, including under `skip`. A seeded query therefore swaps atomically from the old value to the new one with no intermediate `undefined`, and `loading` stays `false` while the result is confirmed in the background. Because `initialData` must correspond to the current variables, reusing one `initialData` object across two different sets of variables logs a warning in development.

Fragment hooks are keyed by ref identity — the ref's storage key plus that fragment's own arguments — falling back to ref content only when the ref carries no storage key. Immutable query data hands down a fresh ref object on any parent change; identity keying means those no longer force a resubscription, while a genuine ref transition resolves for the very reader that sees it (a render or derivation whose key no longer matches the emission reads through to the cache) instead of arriving one frame late. Ref transitions are atomic in the same sense as variable changes, and the synchronous initial-load contract is unchanged.

Subscriptions replace `data` wholesale on every event and never merge events into an accumulated value — collect history yourself in `onData` if you need it. `loading: true` means no event has arrived for the current variables yet, not that a request is in flight, so a stream that stays quiet after opening keeps reporting `loading: true`. `onData` and `onError` fire only on real emissions from the server; releasing `data` on a variables change is not an emission and never invokes either.

`applyPatchesImmutable` and `applyPatchesMutable` are now generic over the target type and return `T | null | undefined`, so a root-level `set` patch that replaces the root is representable, and the observer passes a `null` emission through to `previousData` instead of reading it as "no data". No cache path currently reachable produces a root-null patch — these arms close a latent hole in the type and the derivation, not a user-visible bug.

Re-execution is scoped to exactly three dependencies in every binding — the observer key, `skip`, and the `fetchPolicy` value, each compared by value. Other reactive values read inside the `variables` or options thunks are read untracked at execution time and no longer re-trigger the operation, and passing a fresh object literal for unchanged variables no longer re-executes either. React additionally re-executes when the `ClientProvider` value changes; the other bindings capture the client once at setup.

The state machine itself lives in `@mearie/core`, which now exports the observer primitives (`computeObserverKey`, `initObserverState`, `beginFetch`, `acceptResult`, `acceptInitialData`, `trackInitialData`, `reduceObserverResult`, `reduceFragmentResult`, `deriveObserverView`, the ref-identity readers and their types) alongside the `FragmentRefKey` and `FragmentVarsKey` symbols the identity read depends on. All four bindings are thin shells over it, so the contract is identical everywhere while each keeps its native grain: Svelte `$state` + `$derived` + `$effect.pre`, React `useState` with render-phase derivation plus an isomorphic layout effect, Vue `shallowRef` + `computed` + an immediate pre-flush `watch` over enumerated sources, Solid `createStore`/`reconcile` + `createMemo` + `createComputed`. Fine-grained propagation is preserved throughout — per-field derived values mean a commit only wakes readers of the fields that actually changed. In Solid, `previousData` becomes a structural snapshot once the new key produces a result, because `reconcile` rewrites the previously committed node in place; the Solid subscription hook uses a plain signal rather than a store, since an event stream has no leaf-level granularity to preserve.

If you relied on the old behavior of keeping previous data visible while the next variables load, switch to `data ?? previousData`.
