---
"@mearie/core": minor
---

feat(core): add cache extract/hydrate and client maybeExtension

`cacheExchange` now exposes `extract()` and `hydrate()` on its extension,
allowing the normalized cache to be serialized to a plain object and later
restored—useful for SSR hydration. The opaque `CacheSnapshot` type is
exported from `@mearie/core`.

`Client` gains a `maybeExtension()` method that returns the extension or
`undefined` (rather than throwing) when the exchange is not present.
