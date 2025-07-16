# WebSocket Link

Use WebSocket connections for real-time GraphQL subscriptions.

## Basic Usage

```typescript
import { createClient, wsLink } from 'mearie';

export const client = createClient({
  links: [wsLink({ url: 'wss://api.example.com/graphql' })],
});
```

::: warning Terminating Link
WebSocket Link is a terminating link - it must be the last link in your chain (or one of the last if you have multiple terminating links).
:::

## Configuration

### URL

Specify the WebSocket endpoint:

```typescript
export const client = createClient({
  links: [wsLink({ url: 'wss://api.example.com/graphql' })],
});
```

### Connection Parameters

Pass authentication or other connection parameters:

```typescript
export const client = createClient({
  links: [
    wsLink({
      url: 'wss://api.example.com/graphql',
      connectionParams: {
        authToken: localStorage.getItem('token'),
      },
    }),
  ],
});
```

### Dynamic Connection Parameters

Use a function for dynamic values:

```typescript
export const client = createClient({
  links: [
    wsLink({
      url: 'wss://api.example.com/graphql',
      connectionParams: () => ({
        authToken: localStorage.getItem('token'),
      }),
    }),
  ],
});
```

## How It Works

1. Opens WebSocket connection to server
2. Sends subscription operations over the connection
3. Receives real-time updates as messages
4. Automatically reconnects on connection loss

## Common Patterns

### With HTTP Fallback

```typescript
export const client = createClient({
  links: [
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
    wsLink({ url: 'wss://api.example.com/graphql' }),
  ],
});
```

WebSocket Link handles subscriptions, HTTP Link handles queries and mutations.

### Lazy Connection

Only open connection when first subscription starts:

```typescript
export const client = createClient({
  links: [
    wsLink({
      url: 'wss://api.example.com/graphql',
      lazy: true, // Default: false
    }),
  ],
});
```

### Keep-Alive

Send periodic ping messages to keep connection alive:

```typescript
export const client = createClient({
  links: [
    wsLink({
      url: 'wss://api.example.com/graphql',
      keepAlive: 30000, // Ping every 30 seconds
    }),
  ],
});
```

## Automatic Reconnection

WebSocket Link automatically reconnects when the connection is lost:

```typescript
export const client = createClient({
  links: [
    wsLink({
      url: 'wss://api.example.com/graphql',
      reconnect: true, // Default: true
      reconnectAttempts: 5, // Default: Infinity
      reconnectInterval: 1000, // Default: 1000ms
    }),
  ],
});
```

Reconnection happens independently of [Retry Link](/links/retry).

## Link Chain Placement

Place wsLink at the end of your chain:

```typescript
export const client = createClient({
  links: [
    retryLink(),
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
    wsLink({ url: 'wss://api.example.com/graphql' }), // Last (for subscriptions)
  ],
});
```

This ensures all non-terminating links execute before opening the WebSocket connection.

## Next Steps

- [SSE Link](/links/sse) - Alternative using Server-Sent Events
- [Subscriptions](/guides/subscriptions) - Learn about real-time updates
- [Links](/guides/links) - Learn about the link system
