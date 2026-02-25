---
"@mearie/svelte": patch
---

fix(svelte): ship type-stripped `.svelte.js` files for `svelte` export condition

The `svelte` export condition now points to `dist/svelte/*.svelte.js` files
(TypeScript types stripped, Svelte runes preserved) instead of raw `.svelte.ts` source.
This fixes `vite-plugin-svelte`'s dep optimizer failing to parse TypeScript syntax
during dependency pre-bundling.
