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

## Next Steps

- [Exchanges Guide](/guides/exchanges) - Learn how exchanges work
- [HTTP Exchange](/exchanges/http) - Configure HTTP transport
- [Cache Exchange](/exchanges/cache) - Configure caching
- [Custom Exchanges](/exchanges/custom) - Create custom middleware
