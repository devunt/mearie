---
"@mearie/core": patch
---

Fix normalized cache incorrectly deep-merging object-valued scalar fields (e.g. JSON scalars) instead of atomically replacing them
