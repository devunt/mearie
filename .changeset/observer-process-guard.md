---
'@mearie/core': patch
---

Fix the dev-only initialData reuse warning's environment guard so core compiles under non-node tsconfigs. The framework packages type-check core's source through their development exports, and the bare `process` global reference broke `@mearie/svelte`'s build tsconfig (no `@types/node`). The guard now reads `process` via `globalThis`, which is type-neutral and runtime-safe in browsers; behavior is unchanged in every real environment (disabled without a `process` global or under `NODE_ENV=production`, enabled in development).
