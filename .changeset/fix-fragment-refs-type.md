---
"@mearie/shared": patch
---

Fix `FragmentRefs<T>` type so that a ref containing multiple fragments is assignable to a ref requiring a subset of those fragments

Previously, `FragmentRefs<"A" | "B">` was not assignable to `FragmentRefs<"B">` because TypeScript evaluated `"A" | "B"` as not assignable to `"B"`. By changing the internal `' $fragmentRefs'` property to a mapped object type `{ [K in T]: true }`, structural subtyping now correctly allows `{ A: true, B: true }` to be assigned to `{ B: true }`.
