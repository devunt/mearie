---
'@mearie/core': patch
---

Fix `cache.invalidate()` to invalidate all argument variants when `$args` is omitted. Previously, `invalidate({__typename: 'Query', $field: 'notes'})` only matched the no-args entry (`notes@{}`), missing queries like `notes(limit: 20)`. Now omitting `$args` correctly uses prefix matching to invalidate every cached variant of the field regardless of arguments.
