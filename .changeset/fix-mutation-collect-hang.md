---
"@mearie/svelte": patch
"@mearie/solid": patch
"@mearie/react": patch
"@mearie/vue": patch
---

fix: add missing `take(1)` before `collect` in `createMutation`/`useMutation`

`executeMutation` returns a stream derived from the long-lived `results$` subject, which never completes on its own. Without `take(1)`, `collect` waits for `complete()` indefinitely, causing the mutation promise to never resolve. `client.mutation()` in core already had `take(1)`, but all framework bindings were missing it.
