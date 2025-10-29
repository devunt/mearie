import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), mearie()],
});
