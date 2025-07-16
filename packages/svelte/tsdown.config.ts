import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.svelte.ts'],
  format: ['esm', 'cjs'],
  clean: true,
  dts: true,
  external: ['svelte', 'svelte/store'],
});
