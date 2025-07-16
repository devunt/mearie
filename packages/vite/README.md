# @mearie/vite

Vite plugin for Mearie GraphQL client.

This package provides a Vite plugin that enables automatic type generation from
GraphQL queries written as template literals in your code.

## Installation

```bash
npm install @mearie/vite
```

## Usage

Add the plugin to your Vite configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import mearie from '@mearie/vite';

export default defineConfig({
  plugins: [mearie()],
});
```

By default, the plugin looks for `schema.graphql` in your project root. You can
customize the schema location and other options:

```typescript
export default defineConfig({
  plugins: [
    mearie({
      schema: './path/to/schema.graphql',
    }),
  ],
});
```

## Documentation

Full documentation is available at <https://mearie.dev/config/codegen>.
