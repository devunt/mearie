import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/config.ts', 'src/types.ts', 'src/vite.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
});
