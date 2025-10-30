import type { ResolvedMearieConfig } from './types.ts';

export const defaultResolvedMearieConfig: ResolvedMearieConfig = {
  schema: 'schema.graphql',
  document: '**/*.{js,jsx,ts,tsx,vue,svelte,astro}',
  exclude: ['**/node_modules/**', '**/dist/**'],
  scalars: {},
};
