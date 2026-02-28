---
"@mearie/core": minor
"@mearie/shared": minor
"@mearie/native": minor
---

Type-safe `cache.invalidate()` with schema-aware key fields and field names

- **Breaking:** `invalidate()` now uses actual entity key field names instead of a generic `id` property. Entities with `keyFields: ["_id"]` now require `{ __typename: 'User', _id: '123' }` instead of `{ __typename: 'User', id: '123' }`. Composite keys are spread directly: `{ __typename: 'Comment', postId: '1', commentId: '2' }`.
- **Breaking:** `field` and `args` properties renamed to `$field` and `$args` to avoid conflicts with GraphQL field identifiers.
- `InvalidateTarget` is now generic over `SchemaMeta`, providing compile-time validation of `__typename`, key field names, and `$field` values.
- `CacheOperations` and `ExchangeExtensionMap` are now generic over `SchemaMeta`, flowing schema type information from `Client<TMeta>` through `extension('cache')`.
- `SchemaMeta` extended with phantom type properties (`' $entityTypes'`, `' $queryFields'`) carrying entity key field types and query field names.
- Codegen now emits `entities` and `queryFields` metadata in the `$Schema` type declaration, enabling end-to-end type safety from schema to `invalidate()` calls.
