# @mearie/native

## 0.3.0

### Minor Changes

- c5af823: Type-safe `cache.invalidate()` with schema-aware key fields and field names
  - **Breaking:** `invalidate()` now uses actual entity key field names instead of a generic `id` property. Entities with `keyFields: ["_id"]` now require `{ __typename: 'User', _id: '123' }` instead of `{ __typename: 'User', id: '123' }`. Composite keys are spread directly: `{ __typename: 'Comment', postId: '1', commentId: '2' }`.
  - **Breaking:** `field` and `args` properties renamed to `$field` and `$args` to avoid conflicts with GraphQL field identifiers.
  - `InvalidateTarget` is now generic over `SchemaMeta`, providing compile-time validation of `__typename`, key field names, and `$field` values.
  - `CacheOperations` and `ExchangeExtensionMap` are now generic over `SchemaMeta`, flowing schema type information from `Client<TMeta>` through `extension('cache')`.
  - `SchemaMeta` extended with phantom type properties (`' $entityTypes'`, `' $queryFields'`) carrying entity key field types and query field names.
  - Codegen now emits `entities` and `queryFields` metadata in the `$Schema` type declaration, enabling end-to-end type safety from schema to `invalidate()` calls.

### Patch Changes

- ff503be: Fix `queryFields` codegen falling back to `string` when schema omits explicit `schema { query: Query }` definition

## 0.2.2

### Patch Changes

- 1b248b5: Add snapshot release support

## 0.2.1

### Patch Changes

- c9b482b: Update macOS CI runners to `macos-latest` to fix build failures caused by the deprecated `macos-13` runner.

## 0.2.0

### Minor Changes

- ccfabf9: Add `@required` directive support with `THROW` and `CASCADE` actions for client-side null handling. `THROW` throws `RequiredFieldError` when a required field is null; `CASCADE` propagates null to the nearest nullable ancestor.

### Patch Changes

- bbb9412: Fix `@required` directive not being stripped from fragment sources included in operation body
- b8df747: Allow GraphQL keywords as identifiers in all parser contexts, per the GraphQL specification.

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages
