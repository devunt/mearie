---
description: Configure the GraphQL client with exchanges for networking, caching, and custom behavior. Learn basic and recommended production configurations.
---

# Client Config

Configure the GraphQL client with exchanges for networking, caching, and custom behavior.

## Basic Configuration

Create a client with at least one terminating exchange (like `httpExchange`):

```typescript
// src/lib/graphql-client.ts
import { createClient, httpExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

## Recommended Configuration

Add caching and deduplication for production use:

```typescript
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
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

## Custom Scalars

Transform custom GraphQL scalars like `DateTime`, `JSON`, or `UUID` between GraphQL and JavaScript types:

```typescript
import { createClient, httpExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
  scalars: {
    DateTime: {
      parse: (value) => new Date(value as string),
      serialize: (value) => value.toISOString(),
    },
    JSON: {
      parse: (value) => JSON.parse(value as string),
      serialize: (value) => JSON.stringify(value),
    },
    UUID: {
      parse: (value) => value as string,
      serialize: (value) => value,
    },
  },
});
```

Each scalar requires two functions:

- **`parse`** - Transforms values from GraphQL responses into JavaScript types
- **`serialize`** - Transforms JavaScript values into GraphQL variables

::: tip
You also need to configure type mappings in `mearie.config.ts` for TypeScript. See [Scalars Guide](/guides/scalars) for complete setup instructions.
:::

## Next Steps

- [Exchanges Guide](/guides/exchanges) - Learn how exchanges work
- [Scalars Guide](/guides/scalars) - Complete custom scalar setup
- [HTTP Exchange](/exchanges/http) - Configure HTTP transport
- [Cache Exchange](/exchanges/cache) - Configure caching
- [Custom Exchanges](/exchanges/custom) - Create custom middleware
