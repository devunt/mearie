---
"@mearie/cli": patch
"@mearie/codegen": patch
"@mearie/config": patch
"@mearie/core": patch
"@mearie/react": patch
"@mearie/shared": patch
"@mearie/solid": patch
"@mearie/svelte": patch
"@mearie/vite": patch
"@mearie/vue": patch
"mearie": patch
---

fix: correct publishConfig exports to match tsdown output extensions

`tsdown` outputs `.mjs`/`.cjs` files with `.d.mts`/`.d.cts` type declarations,
but `publishConfig.exports` was referencing `.js`/`.d.ts` files that do not exist.
TypeScript with `moduleResolution: bundler` follows the `exports` field directly,
so it failed to resolve types for all published packages.

Updated all `publishConfig.exports` to use nested `import`/`require` conditions
with the correct `.mjs`/`.d.mts` and `.cjs`/`.d.cts` extensions respectively.
