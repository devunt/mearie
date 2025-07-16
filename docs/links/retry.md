# Retry Link

Automatically retry failed requests with exponential backoff.

## Basic Usage

```typescript
import { createClient, retryLink, httpLink } from 'mearie';

export const client = createClient({
  links: [retryLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

## Configuration

### Max Attempts

Set the maximum number of retry attempts:

```typescript
export const client = createClient({
  links: [
    retryLink({
      maxAttempts: 3, // Default: 3
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

### Backoff Strategy

Customize the delay between retries:

```typescript
export const client = createClient({
  links: [
    retryLink({
      backoff: (attempt) => {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        return Math.min(1000 * 2 ** attempt, 30000);
      },
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

Default backoff: `Math.min(1000 * 2 ** attempt, 30000)` (max 30 seconds)

### Jitter

Add randomness to prevent thundering herd:

```typescript
export const client = createClient({
  links: [
    retryLink({
      jitter: true, // Default: false
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

When enabled, jitter adds random variation to backoff delays, preventing simultaneous retries across multiple users.

### Retry Condition

Control which errors should be retried:

```typescript
export const client = createClient({
  links: [
    retryLink({
      retryIf: (error) => {
        // Retry on network errors
        if (error.name === 'NetworkError') return true;

        // Retry on 5xx server errors
        if (error.status >= 500 && error.status < 600) return true;

        // Don't retry on other errors
        return false;
      },
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

Default: Retries on network errors and 5xx server errors.

## How It Works

1. Catches errors from downstream links
2. Checks if error should be retried (using `retryIf`)
3. Waits for backoff delay
4. Retries operation until success or max attempts reached

## Common Patterns

### Retry Only Network Errors

```typescript
export const client = createClient({
  links: [
    retryLink({
      retryIf: (error) => error.name === 'NetworkError',
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

### Retry with Linear Backoff

```typescript
export const client = createClient({
  links: [
    retryLink({
      backoff: (attempt) => attempt * 1000, // 1s, 2s, 3s, 4s...
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

### Monitor Retry Attempts

```typescript
export const client = createClient({
  links: [
    retryLink({
      maxAttempts: 3,
      onRetry: (attempt, error) => {
        console.log(`Retry attempt ${attempt}:`, error.message);
      },
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

## Mutation Safety

**Mutations are never retried** by default, since they may not be idempotent:

```typescript
// This will NOT be retried, even with retryLink
const [createUser] = useMutation(
  graphql(`
    mutation CreateUser($name: String!) {
      createUser(input: { name: $name }) {
        id
        name
      }
    }
  `),
);
```

## Subscription Reconnection

**Subscriptions automatically reconnect** when the connection is lost, independent of retryLink. See [SSE Link](/links/sse) or [WebSocket Link](/links/ws) for more information.

## Request Cancellation

Retries respect AbortController:

```typescript
const controller = new AbortController();

client.query(GetUserQuery, { id: '1' }, { signal: controller.signal });

// Aborts the current attempt and all future retries
controller.abort();
```

## Link Chain Placement

Place retryLink early in the chain, before cache:

```typescript
export const client = createClient({
  links: [
    retryLink(), // Outermost
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

This ensures retries trigger the entire cache + HTTP flow.

## Next Steps

- [Deduplication Link](/links/dedup) - Prevent duplicate requests
- [Cache Link](/links/cache) - Add normalized caching
- [Links](/guides/links) - Learn about the link system
