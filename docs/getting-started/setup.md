---
description: Configure Mearie's build plugin for automatic type generation, create a GraphQL client with links, and set up the provider for your framework.
---

# Setup

Configure Mearie's build plugin, create a client, and connect it to your framework.

## Add Build Plugin

Add Mearie's build plugin to enable automatic type generation from your GraphQL documents:

::: code-group

```typescript [Vite]
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [react(), mearie()],
});
```

```typescript [Next.js]
// next.config.js
import withMearie from 'mearie/next';

export default withMearie({
  // Your Next.js config
});
```

:::

::: tip
By default, Mearie looks for `./schema.graphql` relative to your `vite.config.ts` or `next.config.js`. For custom schema locations or advanced configuration, see [Codegen Config](/config/codegen).
:::

## Create Client

Create a GraphQL client with your API endpoint. Links are middleware-style handlers that process requests and responses. At least one terminating link is required (in this case, `httpLink`). See [Links](/guides/links) for more details.

```typescript
// src/lib/graphql-client.ts
import { createClient, httpLink, cacheLink, dedupLink } from 'mearie';

export const client = createClient({
  links: [
    dedupLink(),
    cacheLink(),
    httpLink({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

## Set Up Provider

Wrap your app with the client provider to make the GraphQL client available throughout your component tree:

::: code-group

```tsx [React]
// src/app.tsx
import { ClientProvider } from '@mearie/react';
import { client } from './lib/graphql-client';

<ClientProvider client={client}>
  <App />
</ClientProvider>;
```

```ts [Vue]
// src/main.ts
import { ClientPlugin } from '@mearie/vue';
import { client } from './lib/graphql-client';

app.use(ClientPlugin, { client });
```

```svelte [Svelte]
<!-- src/main.svelte -->
<script lang="ts">
  import { setClient } from '@mearie/svelte';
  import { client } from './lib/graphql-client';

  setClient(client);
</script>
```

```tsx [Solid]
// src/index.tsx
import { ClientProvider } from '@mearie/solid';
import { client } from './lib/graphql-client';

<ClientProvider client={client}>
  <App />
</ClientProvider>;
```

:::

See framework-specific docs: [React](/frameworks/react), [Vue](/frameworks/vue), [Svelte](/frameworks/svelte), [Solid](/frameworks/solid)

## Next Steps

- [Your First Query](/getting-started/your-first-query) - Write your first GraphQL query
- [Using Fragments](/getting-started/using-fragments) - Split queries into reusable fragments
