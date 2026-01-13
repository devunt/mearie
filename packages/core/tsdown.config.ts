import { defineConfig } from 'tsdown';

export default defineConfig({
  format: ['esm', 'cjs'],
  dts: true,
  entry: {
    index: 'src/index.ts',
    'stream/index': 'src/stream/index.ts',
  },
});
