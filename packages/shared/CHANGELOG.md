# @mearie/shared

## 0.3.0

### Minor Changes

- c5af823: Type-safe `cache.invalidate()` with schema-aware key fields and field names
  - **Breaking:** `invalidate()` now uses actual entity key field names instead of a generic `id` property. Entities with `keyFields: ["_id"]` now require `{ __typename: 'User', _id: '123' }` instead of `{ __typename: 'User', id: '123' }`. Composite keys are spread directly: `{ __typename: 'Comment', postId: '1', commentId: '2' }`.
  - **Breaking:** `field` and `args` properties renamed to `$field` and `$args` to avoid conflicts with GraphQL field identifiers.
  - `InvalidateTarget` is now generic over `SchemaMeta`, providing compile-time validation of `__typename`, key field names, and `$field` values.
  - `CacheOperations` and `ExchangeExtensionMap` are now generic over `SchemaMeta`, flowing schema type information from `Client<TMeta>` through `extension('cache')`.
  - `SchemaMeta` extended with phantom type properties (`' $entityTypes'`, `' $queryFields'`) carrying entity key field types and query field names.
  - Codegen now emits `entities` and `queryFields` metadata in the `$Schema` type declaration, enabling end-to-end type safety from schema to `invalidate()` calls.

## 0.2.2

### Patch Changes

- 1b248b5: Add snapshot release support

## 0.2.1

### Patch Changes

- f391689: fix: correct publishConfig exports to match tsdown output extensions

  `tsdown` outputs `.mjs`/`.cjs` files with `.d.mts`/`.d.cts` type declarations,
  but `publishConfig.exports` was referencing `.js`/`.d.ts` files that do not exist.
  TypeScript with `moduleResolution: bundler` follows the `exports` field directly,
  so it failed to resolve types for all published packages.

  Updated all `publishConfig.exports` to use nested `import`/`require` conditions
  with the correct `.mjs`/`.d.mts` and `.cjs`/`.d.cts` extensions respectively.

## 0.2.0

### Minor Changes

- ccfabf9: Add `@required` directive support with `THROW` and `CASCADE` actions for client-side null handling. `THROW` throws `RequiredFieldError` when a required field is null; `CASCADE` propagates null to the nearest nullable ancestor.

### Patch Changes

- 7a7f7d6: Fix `FragmentRefs<T>` type so that a ref containing multiple fragments is assignable to a ref requiring a subset of those fragments

  Previously, `FragmentRefs<"A" | "B">` was not assignable to `FragmentRefs<"B">` because TypeScript evaluated `"A" | "B"` as not assignable to `"B"`. By changing the internal `' $fragmentRefs'` property to a mapped object type `{ [K in T]: true }`, structural subtyping now correctly allows `{ A: true, B: true }` to be assigned to `{ B: true }`.

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages
