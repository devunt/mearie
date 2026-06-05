import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/codegen',
      'packages/react',
      'packages/vue',
      'packages/solid',
      'packages/svelte',
    ],
  },
});
