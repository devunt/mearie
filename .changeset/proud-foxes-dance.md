---
"@mearie/core": minor
"@mearie/react": minor
"@mearie/solid": minor
"@mearie/svelte": minor
"@mearie/vue": minor
---

Add `FragmentList` type and array overload to fragment composables. `createFragment`/`useFragment` now accept an array of fragment references and return `FragmentList<T>` with a `data: DataOf<T>[]` field.
