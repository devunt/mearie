---
description: Create your own exchanges to add custom behavior to GraphQL operations using stream transformations. Learn patterns for logging, headers, filtering, and more.
---

# Custom Exchanges

Create your own exchanges to add custom behavior to GraphQL operations using stream transformations.

## Exchange Interface

An exchange transforms operation streams into result streams:

```typescript
type Exchange = (input: ExchangeInput) => ExchangeIO;

type ExchangeInput = {
  forward: ExchangeIO; // Next exchange in the chain
  client: Client; // Access to the client instance
};

type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;
```

::: tip Learn Stream Basics
Before writing custom exchanges, familiarize yourself with [Streams Concept](/concepts/streams) and the [Streams Reference](/references/streams).
:::

::: danger Critical: Call Forward Exactly Once
**You must call `forward` exactly once** in your exchange implementation. Calling `forward` multiple times creates duplicate instances of all downstream exchanges, breaking the client's single-instance guarantee.

If you need to handle different operation types separately, split the stream, merge them back into one, then forward once.
:::

## Basic Pattern

Every exchange follows this structure:

```typescript
import { type Exchange } from '@mearie/react';

const myExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Transform operations stream
      const transformed$ = transformOperations(ops$);

      // Forward to next exchange and get results
      const results$ = forward(transformed$);

      // Transform results stream
      return transformResults(results$);
    };
  };
};
```

## Simple Example: Logging

Log operations and results as they flow through:

```typescript
import { pipe, tap } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';
import { schema } from '$mearie';

const loggingExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        tap((op) => {
          if (op.variant === 'request') {
            console.log('Operation:', op.artifact.kind, op.artifact.name);
          }
        }),
        forward,
        tap((result) => {
          console.log('Result:', result.data ? 'success' : 'error');
        }),
      );
    };
  };
};

export const client = createClient({
  schema,
  exchanges: [loggingExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

## Common Patterns

### Filtering Operations

Filter operations while ensuring `forward` is called exactly once:

```typescript
import { pipe, filter, merge } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const queriesOnlyExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Separate queries from other operations
      const queries$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'query'),
      );

      const others$ = pipe(
        ops$,
        filter((op) => op.variant !== 'request' || op.artifact.kind !== 'query'),
      );

      // Merge streams back into one, then forward ONCE
      return pipe(merge(queries$, others$), forward);
    };
  };
};
```

### Transforming Operations

Modify operations before forwarding:

```typescript
import { pipe, map } from '@mearie/core/stream';
import { type Exchange, type RequestOperation } from '@mearie/react';

const addMetadataExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        map((op) => {
          if (op.variant === 'request') {
            return {
              ...op,
              metadata: {
                ...op.metadata,
                clientVersion: '1.0.0',
                timestamp: Date.now(),
              },
            };
          }
          return op;
        }),
        forward,
      );
    };
  };
};
```

### Transforming Results

Modify results coming back:

```typescript
import { pipe, map } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const timestampExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        forward,
        map((result) => ({
          ...result,
          extensions: {
            ...result.extensions,
            receivedAt: new Date().toISOString(),
          },
        })),
      );
    };
  };
};
```

### Performance Monitoring

Track operation timing:

```typescript
import { pipe, tap } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const performanceExchange = (): Exchange => {
  const timings = new Map<string, number>();

  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        tap((op) => {
          if (op.variant === 'request') {
            timings.set(op.key, performance.now());
          }
        }),
        forward,
        tap((result) => {
          const startTime = timings.get(result.operation.key);
          if (startTime !== undefined) {
            const duration = performance.now() - startTime;
            console.log(`Operation took ${duration.toFixed(2)}ms`);
            timings.delete(result.operation.key);
          }
        }),
      );
    };
  };
};
```

### Conditional Forwarding

Execute different logic based on operation type:

```typescript
import { pipe, filter, merge, tap } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const splitExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Split mutations from other operations
      const mutations$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'mutation'),
      );

      const others$ = pipe(
        ops$,
        filter((op) => op.variant !== 'request' || op.artifact.kind !== 'mutation'),
      );

      // Merge streams, forward ONCE, then handle results differently
      return pipe(
        merge(mutations$, others$),
        forward,
        tap((result) => {
          if (result.operation.variant === 'request' && result.operation.artifact.kind === 'mutation') {
            console.log('Mutation completed');
          }
        }),
      );
    };
  };
};
```

### Async Operations

Handle async operations with `mergeMap`:

```typescript
import { pipe, mergeMap } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const authExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      return pipe(
        ops$,
        mergeMap(async (op) => {
          if (op.variant === 'request') {
            // Fetch token asynchronously
            const token = await getAuthToken();
            return {
              ...op,
              metadata: {
                ...op.metadata,
                authToken: token,
              },
            };
          }
          return op;
        }),
        forward,
      );
    };
  };
};
```

## Splitting and Merging Streams

When you need to handle different operations separately, split the stream into multiple parts, process each independently, then merge them back before forwarding:

```typescript
import { pipe, filter, merge } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const smartExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Split stream into multiple parts
      const mutations$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'mutation'),
      );

      const queries$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'query'),
      );

      const teardowns$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown'),
      );

      // Merge all streams back into one
      const merged$ = merge(mutations$, queries$, teardowns$);

      // Forward the merged stream ONCE
      return pipe(merged$, forward);
    };
  };
};
```

This ensures downstream exchanges maintain exactly one instance. See the built-in `dedupExchange` implementation for a real-world example.

## Terminating Exchange

A terminating exchange doesn't forward operations - it handles them directly:

```typescript
import { pipe, filter, mergeMap, fromValue, merge } from '@mearie/core/stream';
import { type Exchange } from '@mearie/react';

const mockExchange = (mockData: Record<string, unknown>): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Handle queries with mock data
      const queries$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'query'),
        mergeMap((op) =>
          fromValue({
            operation: op,
            data: mockData,
          }),
        ),
      );

      // Forward everything else
      const others$ = pipe(
        ops$,
        filter((op) => op.variant !== 'request' || op.artifact.kind !== 'query'),
        forward,
      );

      return merge(queries$, others$);
    };
  };
};

// Usage for testing
export const client = createClient({
  schema,
  exchanges: [mockExchange({ user: { id: '1', name: 'Test User' } })],
});
```

## Stream Operators

Common operators for building exchanges:

- **`pipe`** - Compose operators
- **`filter`** - Filter operations/results
- **`map`** - Transform values synchronously
- **`mergeMap`** - Transform values to new streams
- **`tap`** - Side effects without transformation
- **`merge`** - Combine multiple streams
- **`share`** - Share subscription among subscribers

See [Streams Reference](/references/streams) for complete documentation.

## Best Practices

- **Call `forward` exactly once** - Critical for maintaining single-instance exchanges
- **Keep exchanges focused** - Each should do one thing well
- **Use `share()` when needed** - Prevent duplicate subscriptions
- **Handle teardown** - Watch for `variant: 'teardown'` operations
- **Consider ordering** - Place exchanges logically in the chain
- **Don't block** - Avoid synchronous expensive operations
- **Use `mergeMap` for async** - Never use `await` directly in `map`

## Exchange Placement

Place custom exchanges strategically:

```typescript
export const client = createClient({
  schema,
  exchanges: [
    loggingExchange(), // Monitoring - outermost
    performanceExchange(), // Performance tracking
    dedupExchange(), // Deduplication
    addMetadataExchange(), // Request transformation - after dedup, before cache
    cacheExchange(), // Caching
    httpExchange({ url: 'https://api.example.com/graphql' }), // Terminating
  ],
});
```

General guidelines:

- **Monitoring/logging** - Outermost layer to see all operations
- **Deduplication** - Early in the chain to filter duplicates
- **Request transformation** - After dedup, before cache to affect cache keys
- **Non-terminating exchanges** - Before terminating exchanges
- **Terminating exchanges** - At the end

## Next Steps

- [Streams Concept](/concepts/streams) - Understand stream architecture
- [Streams Reference](/references/streams) - Complete stream API
- [Exchanges Guide](/guides/exchanges) - Learn the exchange system
- [HTTP Exchange](/exchanges/http) - Built-in HTTP implementation
