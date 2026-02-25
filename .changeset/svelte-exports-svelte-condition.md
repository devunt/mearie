---
"@mearie/svelte": patch
---

fix: add `svelte` export condition for proper rune compilation

Add `svelte` export condition to `publishConfig.exports` pointing to source `.svelte.ts` files.
This allows `vite-plugin-svelte` to compile runes (`$state`, `$effect`, etc.) directly,
fixing the `rune_outside_svelte` error when consuming the package in Svelte projects.
