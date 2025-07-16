# SSE Link

Use Server-Sent Events for real-time GraphQL subscriptions.

## Basic Usage

```typescript
import { createClient, sseLink } from 'mearie';

export const client = createClient({
  links: [sseLink({ url: 'https://api.example.com/graphql' })],
});
```

::: warning Terminating Link
SSE Link is a terminating link - it must be the last link in your chain (or one of the last if you have multiple terminating links).
:::

## Configuration

### URL

Specify the GraphQL endpoint:

```typescript
export const client = createClient({
  links: [sseLink({ url: 'https://api.example.com/graphql' })],
});
```

### Headers

Add custom headers to all requests:

```typescript
export const client = createClient({
  links: [
    sseLink({
      url: 'https://api.example.com/graphql',
      headers: {
        Authorization: 'Bearer token',
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
    sseLink({
      url: 'https://api.example.com/graphql',
      credentials: 'include', // 'omit' | 'same-origin' | 'include'
    }),
  ],
});
```

## How It Works

1. Opens HTTP connection with `Accept: text/event-stream`
2. Server sends data as Server-Sent Events
3. Client receives updates in real-time
4. Automatically reconnects on connection loss

## Common Patterns

### With HTTP Fallback

```typescript
export const client = createClient({
  links: [
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
    sseLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

SSE Link handles subscriptions, HTTP Link handles queries and mutations.

### Authentication

```typescript
const getToken = () => localStorage.getItem('token');

export const client = createClient({
  links: [
    sseLink({
      url: 'https://api.example.com/graphql',
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    }),
  ],
});
```

### Dynamic Headers

```typescript
export const client = createClient({
  links: [
    sseLink({
      url: 'https://api.example.com/graphql',
      headers: () => ({
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      }),
    }),
  ],
});
```

## Automatic Reconnection

SSE Link automatically reconnects when the connection is lost:

```typescript
export const client = createClient({
  links: [
    sseLink({
      url: 'https://api.example.com/graphql',
      reconnect: true, // Default: true
      reconnectAttempts: 5, // Default: Infinity
      reconnectInterval: 1000, // Default: 1000ms
    }),
  ],
});
```

Reconnection happens independently of [Retry Link](/links/retry).

## Link Chain Placement

Place sseLink at the end of your chain:

```typescript
export const client = createClient({
  links: [
    retryLink(),
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
    sseLink({ url: 'https://api.example.com/graphql' }), // Last (for subscriptions)
  ],
});
```

This ensures all non-terminating links execute before opening the SSE connection.

## Next Steps

- [WebSocket Link](/links/ws) - Alternative for subscriptions
- [Subscriptions](/guides/subscriptions) - Learn about real-time updates
- [Links](/guides/links) - Learn about the link system
