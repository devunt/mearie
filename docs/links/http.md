---
description: Send GraphQL operations to a server over HTTP. Configure URL, headers, credentials, and request cancellation for your GraphQL endpoint.
---

# HTTP Link

Send GraphQL operations to a server over HTTP.

## Basic Usage

```typescript
import { createClient, httpLink } from 'mearie';

export const client = createClient({
  links: [httpLink({ url: 'https://api.example.com/graphql' })],
});
```

::: warning Terminating Link
HTTP Link is a terminating link - it must be the last link in your chain (or one of the last if you have multiple terminating links).
:::

## Configuration

### URL

Specify the GraphQL endpoint:

```typescript
export const client = createClient({
  links: [httpLink({ url: 'https://api.example.com/graphql' })],
});
```

### Headers

Add custom headers to all requests:

```typescript
export const client = createClient({
  links: [
    httpLink({
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
export const client = createClient({
  links: [
    httpLink({
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

## Link Chain Placement

Place httpLink at the end of your chain:

```typescript
export const client = createClient({
  links: [
    retryLink(),
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }), // Last
  ],
});
```

This ensures all non-terminating links execute before the network request.

## Next Steps

- [Cache Link](/links/cache) - Add normalized caching
- [Retry Link](/links/retry) - Automatically retry failed requests
- [Links](/guides/links) - Learn about the link system
