---
description: Send GraphQL operations to a server over HTTP. Configure URL, headers, credentials, and request cancellation for your GraphQL endpoint.
---

# HTTP Exchange

Send GraphQL operations to a server over HTTP.

## Basic Usage

```typescript
import { createClient, httpExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

::: warning Terminating Exchange
HTTP Exchange is a terminating exchange - it must be the last exchange in your chain (or one of the last if you have multiple terminating exchanges).
:::

## Configuration

### URL

Specify the GraphQL endpoint:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

### Headers

Add custom headers to all requests:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({
      url: 'https://api.example.com/graphql',
      headers: {
        'X-Client-Name': 'mearie',
        'X-Client-Version': '1.0.0',
      },
    }),
  ],
});
```

### Credentials

Control cookie/credential behavior:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({
      url: 'https://api.example.com/graphql',
      credentials: 'include', // 'omit' | 'same-origin' | 'include'
    }),
  ],
});
```

## Common Patterns

### Request Cancellation

Cancel requests using AbortController:

```typescript
const controller = new AbortController();

client.query(GetUserQuery, { id: '1' }, { signal: controller.signal });

// Cancel the request
controller.abort();
```

## Exchange Chain Placement

Place httpExchange at the end of your chain:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    retryExchange(),
    dedupExchange(),
    cacheExchange(),
    httpExchange({ url: 'https://api.example.com/graphql' }), // Last
  ],
});
```

This ensures all non-terminating exchanges execute before the network request.

## Next Steps

- [Cache Exchange](/exchanges/cache) - Add normalized caching
- [Retry Exchange](/exchanges/retry) - Automatically retry failed requests
- [Exchanges](/guides/exchanges) - Learn about the exchange system
