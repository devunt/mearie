---
description: Customize how GraphQL operations are executed with composable middleware. Learn about terminating and non-terminating exchanges, execution order, and built-in exchanges.
---

# Exchanges

Customize how GraphQL operations are executed with composable middleware.

## What are Exchanges?

Exchanges are composable middleware that process your GraphQL operations. Each exchange can modify requests, handle responses, or add features like authentication, caching, and logging.

## Basic Usage

```typescript
import { createClient, httpExchange, cacheExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

## How Exchanges Work

Exchanges use a **stream-based architecture**. Operations flow as a stream through each exchange, and results flow back:

```
Operations Stream
  ↓
[dedupExchange]   ← Filters duplicate operations
  ↓
[cacheExchange]   ← Returns cached data or forwards
  ↓
[httpExchange]    ← Executes network requests
  ↓
Results Stream
```

Each exchange receives a stream of operations, transforms it, and produces a stream of results. This enables:

- **Reactive** - Operations automatically flow through the pipeline
- **Composable** - Exchanges operate independently and compose cleanly
- **Cancellable** - Unsubscribing cancels in-flight operations

::: tip Learn More
For a conceptual understanding of streams, see [Streams Concept](/concepts/streams). For the complete API, see [Streams Reference](/references/streams).
:::

### Terminating vs Non-terminating Exchanges

Exchanges fall into two categories based on their role in the stream pipeline:

**Non-terminating exchanges** transform the operation stream and forward it:

- [`cacheExchange`](/exchanges/cache) - May emit cached results or forward operations
- [`retryExchange`](/exchanges/retry) - Retries operations by replaying them in the stream
- [`dedupExchange`](/exchanges/dedup) - Filters duplicate operations from the stream

**Terminating exchanges** handle operations and don't forward them further:

- [`httpExchange`](/exchanges/http) - Executes queries/mutations over HTTP
- [`subscriptionExchange`](/exchanges/subscription) - Handles subscriptions via SSE or WebSocket

::: warning
You must include at least one terminating exchange (usually `httpExchange`) at the end of your chain. Without it, your operations won't execute.
:::

### Execution Order

The order you define exchanges determines the execution flow:

```typescript
export const client = createClient({
  schema,
  exchanges: [
    retryExchange(), // 1. Retry logic (outermost)
    cacheExchange(), // 2. Cache layer
    httpExchange(), // 3. Network request (innermost)
  ],
});
```

This means:

- Retries will trigger the entire cache + HTTP flow
- Cache can return early without hitting HTTP
- HTTP terminates the chain by making the actual request

## Built-in Exchanges

### HTTP Exchange

Sends GraphQL requests over HTTP (terminating exchange):

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about HTTP Exchange →](/exchanges/http)

### Cache Exchange

Normalized caching with automatic updates:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Cache Exchange →](/exchanges/cache)

### Retry Exchange

Automatic retry with exponential backoff:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [retryExchange({ maxAttempts: 3 }), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Retry Exchange →](/exchanges/retry)

### Deduplication Exchange

Deduplicates identical concurrent requests:

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [dedupExchange(), cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

[Learn more about Deduplication Exchange →](/exchanges/dedup)

### Subscription Exchange

Handles real-time subscriptions via Server-Sent Events or WebSocket:

```typescript
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '$mearie';

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

[Learn more about Subscription Exchange →](/exchanges/subscription)

## Common Patterns

### Full-featured Client

```typescript
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    retryExchange({ maxAttempts: 3 }),
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

### Retry on Network Errors

```typescript
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    retryExchange({
      maxAttempts: 3,
      retryIf: (error) => error.networkError,
    }),
    httpExchange({ url: 'https://api.example.com/graphql' }),
  ],
});
```

## Creating Custom Exchanges

Exchanges transform operation streams. Here's a simple logging exchange:

```typescript
import { pipe, tap } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';
import { schema } from '$mearie';

const loggingExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        tap((op) => console.log('Operation:', op)),
        forward,
        tap((result) => console.log('Result:', result)),
      );
    };
  };
};

export const client = createClient({
  schema,
  exchanges: [loggingExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

The exchange:

1. Receives operations stream `ops$`
2. Logs each operation with `tap`
3. Forwards to next exchange with `forward`
4. Logs each result with `tap`
5. Returns the transformed results stream

[Learn more about Custom Exchanges →](/exchanges/custom)

## Exchange Interface

```typescript
type Exchange = (input: ExchangeInput) => ExchangeIO;

type ExchangeInput = {
  forward: ExchangeIO;
  client: Client;
};

type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;
```

An exchange:

- Takes `forward` (next exchange) and `client` as input
- Returns a function that transforms operation streams to result streams
- Uses stream operators to transform operations and results

## Best Practices

- Order exchanges from outermost (retry, dedup) to innermost (HTTP)
- Always end the chain with a terminating exchange (e.g., `httpExchange`)
- Keep custom exchanges simple and focused on a single concern

## Next Steps

- [Streams Concept](/concepts/streams) - Understand the stream architecture
- [Custom Exchanges](/exchanges/custom) - Build your own exchanges
- [HTTP Exchange](/exchanges/http) - Execute GraphQL over HTTP
- [Cache Exchange](/exchanges/cache) - Add normalized caching
- [Streams Reference](/references/streams) - Complete stream API documentation
