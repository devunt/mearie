import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'vue',
    globals: true,
    environment: 'happy-dom',
  },
});
