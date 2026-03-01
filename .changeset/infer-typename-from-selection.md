---
"@mearie/core": patch
---

Infer `__typename` from field selection type during normalization, fixing optimistic responses that omit `__typename` from being silently ignored by the normalized cache
