---
'@mearie/core': patch
'@mearie/native': patch
---

Support `@skip` and `@include` directives in type generation and normalized cache

- **Type generation**: Fields with `@skip` or `@include` directives are now generated as optional properties in TypeScript types, since they may be absent from the response. No-op cases (`@skip(if: false)`, `@include(if: true)`) are correctly detected and left non-optional.
- **Normalized cache**: `denormalize`, `normalize`, and `traceSelections` now evaluate `@skip`/`@include` directive conditions against variables. Skipped fields are excluded from cache reads/writes, preserving previously cached values and avoiding false partial results.
