---
"@mearie/core": patch
---

fix(cache): denormalize embedded type values in patch output

Patch values for embedded types (non-entity objects without IDs) were exposing internal storage keys (e.g. `additions@{}`) instead of user-facing field names (e.g. `additions`). This occurred because the scalar change path in `generatePatches` passed raw normalized values directly without denormalization.
