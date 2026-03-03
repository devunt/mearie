import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'packages/react', 'packages/vue', 'packages/solid', 'packages/svelte'],
  },
});
