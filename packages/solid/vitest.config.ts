import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid({ dev: true, hot: false })],
  test: {
    name: 'solid',
    globals: true,
    environment: 'happy-dom',
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
  },
});
