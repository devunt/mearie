---
description: Handle real-time GraphQL subscriptions using Server-Sent Events or WebSocket. Learn how to configure subscription clients and integrate with your GraphQL operations.
---

# Subscription Exchange

Handle real-time GraphQL subscriptions using Server-Sent Events or WebSocket.

## Basic Usage

### Server-Sent Events (Recommended)

Simple HTTP-based protocol recommended for most use cases:

```typescript
import { createClient, httpExchange, subscriptionExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '~graphql';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createSSEClient({
        url: 'https://api.example.com/graphql',
      }),
    }),
  ],
});
```

::: tip Install graphql-sse
```sh
npm install graphql-sse
```
:::

### WebSocket

Alternative protocol with lower latency:

```typescript
import { createClient, httpExchange, subscriptionExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { createClient as createWSClient } from 'graphql-ws';
import { schema } from '~graphql';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createWSClient({
        url: 'wss://api.example.com/graphql',
      }),
    }),
  ],
});
```

::: tip Install graphql-ws
```sh
npm install graphql-ws
```
:::

::: warning Terminating Exchange
Subscription Exchange is a terminating exchange - it must be one of the last exchanges in your chain, typically placed after httpExchange.
:::

## Configuration

### Server-Sent Events Options

Configure the SSE client with additional options:

```typescript
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '~graphql';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createSSEClient({
        url: 'https://api.example.com/graphql',
        headers: {
          Authorization: 'Bearer token',
        },
        credentials: 'include',
      }),
    }),
  ],
});
```

### WebSocket Options

Configure the WebSocket client:

```typescript
import { createClient as createWSClient } from 'graphql-ws';
import { schema } from '~graphql';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createWSClient({
        url: 'wss://api.example.com/graphql',
        connectionParams: {
          authToken: 'your-token',
        },
        retryAttempts: 3,
        shouldRetry: () => true,
      }),
    }),
  ],
});
```

## Exchange Chain Placement

Place subscriptionExchange as a terminating exchange:

```typescript
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '~graphql';

export const client = createClient({
  schema,
  exchanges: [
    retryExchange(),
    dedupExchange(),
    cacheExchange(),
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createSSEClient({
        url: 'https://api.example.com/graphql',
      }),
    }),
  ],
});
```

## Next Steps

- [Subscriptions Guide](/guides/subscriptions) - Learn how to use subscriptions in your app
- [HTTP Exchange](/exchanges/http) - Send queries and mutations over HTTP
- [Exchanges](/guides/exchanges) - Learn about the exchange system
