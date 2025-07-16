import { defineConfig } from 'mearie/config';

export default defineConfig({
  scalars: {
    DateTime: 'Date',
    JSON: 'Record<string, unknown>',
  },
});
