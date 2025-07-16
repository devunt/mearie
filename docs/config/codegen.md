# Codegen Config

Configure Mearie's build plugin for automatic type generation from your GraphQL schema.

## Basic Configuration

By default, Mearie looks for `./schema.graphql` relative to your config file. No configuration needed for basic usage:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [mearie()],
});
```

## Advanced Configuration

Create `mearie.config.ts` for custom schema locations or advanced options:

```typescript
// mearie.config.ts
import { defineConfig } from 'mearie/config';

export default defineConfig({
  schema: 'https://api.example.com/graphql',
  document: 'src/**/*.{ts,tsx,vue}',
  exclude: ['**/*.test.ts'],
  scalars: {
    DateTime: 'Date',
  },
});
```

## Configuration Options

### `schema`

GraphQL schema location (default: `schema.graphql`):

```typescript
export default defineConfig({
  // Local file
  schema: './schema.graphql',

  // Remote URL
  schema: 'https://api.example.com/graphql',

  // Multiple schemas
  schema: ['./schema1.graphql', './schema2.graphql'],
});
```

### `document`

Glob patterns for files to process (default: `**/*.{js,jsx,ts,tsx,vue,svelte,astro}`):

```typescript
export default defineConfig({
  schema: 'https://api.example.com/graphql',
  document: 'src/**/*.{ts,tsx}',
});
```

### `exclude`

Glob patterns to exclude (default: `['**/node_modules/**', '**/dist/**']`):

```typescript
export default defineConfig({
  schema: 'https://api.example.com/graphql',
  exclude: ['**/*.test.ts', '**/*.spec.ts'],
});
```

### `scalars`

Map custom GraphQL scalars to TypeScript types:

```typescript
export default defineConfig({
  schema: 'https://api.example.com/graphql',
  scalars: {
    DateTime: 'Date',
    JSON: 'Record<string, any>',
    UUID: 'string',
  },
});
```

## Next Steps

- [Scalars](/guides/scalars) - Learn more about custom scalars
- [Client Config](/config/client) - Configure the GraphQL client
