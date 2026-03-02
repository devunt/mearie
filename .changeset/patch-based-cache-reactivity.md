---
"@mearie/core": minor
"@mearie/react": minor
"@mearie/solid": minor
"@mearie/svelte": minor
"@mearie/vue": minor
---

feat(cache): patch-based fine-grained reactivity

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
