---
"@mearie/react": minor
"@mearie/solid": minor
"@mearie/svelte": minor
"@mearie/vue": minor
---

Add `OptionalFragment` type and null/undefined overload to fragment composables. `createFragment`/`useFragment` now accept a nullable fragment reference and return `OptionalFragment<T>` with a `data: DataOf<T> | null` field.
