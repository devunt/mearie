---
"@mearie/core": patch
"@mearie/react": patch
"@mearie/solid": patch
"@mearie/svelte": patch
"@mearie/vue": patch
---

Implement per-operation query fetch policies. Query options now carry `fetchPolicy` into operation metadata, and `cacheExchange` respects operation-level overrides before falling back to its configured default.
