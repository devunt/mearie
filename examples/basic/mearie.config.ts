import { defineConfig } from 'mearie';

export default defineConfig({
  scalars: {
    DateTime: 'Date',
    JSON: 'Record<string, unknown>',
  },
});
