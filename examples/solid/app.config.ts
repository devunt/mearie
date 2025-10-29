import { defineConfig } from '@solidjs/start/config';
import mearie from 'mearie/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    // @ts-expect-error - Vite plugin version mismatch between SolidStart and plugins (not a runtime issue)
    plugins: [tailwindcss(), mearie()],
  },
});
