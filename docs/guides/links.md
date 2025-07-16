# Links

Customize how GraphQL operations are executed with composable middleware.

## What are Links?

Links are composable middleware that process your GraphQL operations. Each link can modify requests, handle responses, or add features like authentication, caching, and logging.

## Basic Usage

```typescript
import { createClient, httpLink, cacheLink } from 'mearie';

export const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

## How Links Work

Links execute in order, forming a chain:

```
Request Flow:
  cacheLink → httpLink → Server

Response Flow:
  Server → httpLink → cacheLink → Your App
```

### Terminating vs Non-terminating Links

Links fall into two categories:

**Non-terminating links** call `next()` to continue the chain:

- [`cacheLink`](/links/cache) - May return cached data or call `next()`
- [`retryLink`](/links/retry) - Retries by calling `next()` again
- [`dedupLink`](/links/dedup) - Deduplicates and calls `next()`

**Terminating links** execute the actual request and don't call `next()`:

- [`httpLink`](/links/http) - Sends HTTP request to GraphQL server
- [`sseLink`](/links/sse) - Uses Server-Sent Events for real-time updates
- [`wsLink`](/links/ws) - Opens WebSocket connection

::: warning
You must include at least one terminating link (usually `httpLink`) at the end of your chain. Without it, your operations won't execute.
:::

### Execution Order

The order you define links determines the execution flow:

```typescript
export const client = createClient({
  links: [
    retryLink(), // 1. Retry logic (outermost)
    cacheLink(), // 2. Cache layer
    httpLink(), // 3. Network request (innermost)
  ],
});
```

This means:

- Retries will trigger the entire cache + HTTP flow
- Cache can return early without hitting HTTP
- HTTP terminates the chain by making the actual request

## Built-in Links

### HTTP Link

Sends GraphQL requests over HTTP (terminating link):

```typescript
export const client = createClient({
  links: [httpLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about HTTP Link →](/links/http)

### Cache Link

Normalized caching with automatic updates:

```typescript
export const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Cache Link →](/links/cache)

### Retry Link

Automatic retry with exponential backoff:

```typescript
export const client = createClient({
  links: [retryLink({ maxAttempts: 3 }), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Retry Link →](/links/retry)

### Deduplication Link

Deduplicates identical concurrent requests:

```typescript
export const client = createClient({
  links: [dedupLink(), cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Deduplication Link →](/links/dedup)

### SSE Link

Uses Server-Sent Events for real-time updates:

```typescript
export const client = createClient({
  links: [sseLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about SSE Link →](/links/sse)

### WebSocket Link

Opens WebSocket connection for real-time subscriptions:

```typescript
export const client = createClient({
  links: [wsLink({ url: 'wss://api.example.com/graphql' })],
});
```

[Learn more about WebSocket Link →](/links/ws)

## Common Patterns

### Full-featured Client

```typescript
export const client = createClient({
  links: [
    retryLink({ maxAttempts: 3 }),
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
    sseLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

### Retry on Network Errors

```typescript
export const client = createClient({
  links: [
    retryLink({
      maxAttempts: 3,
      retryIf: (error) => error.networkError,
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

## Creating Custom Links

Create custom links to implement your own middleware logic:

```typescript
const loggingLink = (): Link => ({
  name: 'logging',
  async execute(ctx, next) {
    console.log('Request:', ctx.operation);
    const result = await next();
    console.log('Response:', result);
    return result;
  },
});

export const client = createClient({
  links: [loggingLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Custom Links →](/links/custom)

## Link Interface

```typescript
interface Link {
  name: string;
  execute(ctx: LinkContext, next: NextFn): Promise<LinkResult>;
}

interface LinkContext {
  operation: Operation;
  signal?: AbortSignal;
  metadata: Map<string, unknown>;
}

type NextFn = () => Promise<LinkResult>;
```

## Best Practices

- Order links from outermost (retry, dedup) to innermost (HTTP)
- Always end the chain with a terminating link (e.g., `httpLink`)
- Keep custom links simple and focused on a single concern

## Next Steps

- [HTTP Link](/links/http) - Execute GraphQL over HTTP
- [Cache Link](/links/cache) - Add normalized caching
- [Retry Link](/links/retry) - Handle failed requests
- [Custom Links](/links/custom) - Build your own middleware
