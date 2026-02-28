---
"@mearie/core": patch
---

fix(core): store entity-typed objects without key fields as inline objects instead of skipping

When normalizing a union/interface field where the actual type is an entity in the schema but key fields are missing from the response (e.g., `node { __typename ... on Post { id, title } }` returning `{ __typename: "Folder" }`), the normalizer previously returned `SKIP`, silently dropping the field from the cache. This caused `readQuery` to report the result as partial, and the cache exchange would never emit a result.

Now, such objects are stored as inline (non-normalized) objects, preserving the data as returned by the server.
