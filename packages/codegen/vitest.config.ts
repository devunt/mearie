import { defineConfig } from 'vitest/config';
import { generateFixture } from './test/fixtures/generate.ts';

await generateFixture();

export default defineConfig({
  test: {
    name: 'codegen',
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
