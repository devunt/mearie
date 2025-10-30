---
description: Configure Mearie's build plugin for automatic type generation, create a GraphQL client with exchanges, and set up the provider for your framework.
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

## Add Type Reference

Add the generated types to your TypeScript configuration:

::: code-group

```typescript [env.d.ts]
/// <reference types="vite/client" />

import '../.mearie/graphql.d.ts';
```

```typescript [src/vite-env.d.ts]
/// <reference types="vite/client" />

import '../.mearie/graphql.d.ts';
```

:::

This imports the auto-generated GraphQL types so TypeScript can provide type safety for your queries and mutations.

## Create Client

Create a GraphQL client with your API endpoint. Import `createClient` and exchanges from your framework package:

::: code-group

```typescript [React]
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/react';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

```typescript [Vue]
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/vue';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

```typescript [Svelte]
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/svelte';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

```typescript [Solid]
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/solid';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

:::

See [Exchanges](/guides/exchanges) for more details on available exchanges and middleware.

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
