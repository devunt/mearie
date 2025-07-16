import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  external: ['@mearie/native', '@vue/compiler-sfc', 'svelte', 'svelte/compiler', 'svelte2tsx', 'typescript'],
});
