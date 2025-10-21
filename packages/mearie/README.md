# mearie

Build-time codegen and tooling package for Mearie.

This package provides build plugins (Vite, Next.js) and code generation tools
that extract GraphQL queries from your source code and generate TypeScript types
at build time.

## Installation

Install as a dev dependency:

```bash
npm install -D mearie
```

For runtime functionality, install a framework-specific package like
[@mearie/react](https://www.npmjs.com/package/@mearie/react),
[@mearie/vue](https://www.npmjs.com/package/@mearie/vue),
[@mearie/svelte](https://www.npmjs.com/package/@mearie/svelte), or
[@mearie/solid](https://www.npmjs.com/package/@mearie/solid).

## Usage

Add the Vite plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [mearie()],
});
```

Or for Next.js, add to your `next.config.js`:

```javascript
import withMearie from 'mearie/next';

export default withMearie({
  // Your Next.js config
});
```

For framework-specific runtime usage, see [@mearie/react](https://www.npmjs.com/package/@mearie/react),
[@mearie/vue](https://www.npmjs.com/package/@mearie/vue),
[@mearie/svelte](https://www.npmjs.com/package/@mearie/svelte), or
[@mearie/solid](https://www.npmjs.com/package/@mearie/solid).

## Documentation

Full documentation is available at <https://mearie.dev/>.
