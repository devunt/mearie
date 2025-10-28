import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import mearie from 'mearie/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tanstackStart(), react(), tailwindcss(), mearie()],
});
