---
"mearie": patch
---

Include automatically injected fields (__typename and entity key fields) in the runtime selections array (graphql.js). Previously these fields appeared in the query body but were missing from the selections metadata, causing the runtime to lack information about implicit fields. TypeScript types (types.d.ts) remain unchanged — only explicitly selected fields appear in types.
