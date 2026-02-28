---
"@mearie/core": patch
"@mearie/react": patch
"@mearie/vue": patch
"@mearie/solid": patch
"@mearie/svelte": patch
---

feat(core): add optimistic update support for mutations

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
