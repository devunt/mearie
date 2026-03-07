---
"@mearie/core": patch
---

Use deep merge in `cache.hydrate()` to preserve existing embedded object fields that are not present in the incoming snapshot.
