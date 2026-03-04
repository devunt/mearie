---
"@mearie/core": patch
---

refactor(cache): rewrite normalized cache with flat cursor map architecture

Replace tree-based dependency tracking with a flat CursorRegistry and separate trace/diff pipeline. Introduces `traceSelections` for cursor registration and denormalization, `diffSnapshots` for identity-aware patch generation, and a CoW OptimisticStack for layered optimistic updates.
