---
"@mearie/core": patch
---

fix(core): propagate error-only query results through cacheExchange

When a cache-first query received an error response with no data (`data: null, errors: [...]`), the `forward$` filter silently discarded the result (intended only for successful responses to be read from cache). Since no data was written to cache, the `cache$` subscription never fired either, causing the error to be completely lost. Queries would hang indefinitely without emitting an error.

Allow results with errors to pass through the `forward$` filter regardless of fetch policy.
