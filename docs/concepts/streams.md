---
description: Understand the stream-based architecture that powers Mearie's exchange system and enables reactive, composable GraphQL operations.
---

# Streams

Mearie uses a **stream-based architecture** for handling GraphQL operations. Understanding this concept helps you work effectively with exchanges and build custom middleware.

## What are Streams?

Streams in Mearie are push-based, reactive data flows similar to observables in RxJS or Wonka. Think of them as pipelines where data flows from source to destination:

```
Operations → [Exchange 1] → [Exchange 2] → [Exchange 3] → Results
```

Each exchange receives a stream of operations, transforms it, and produces a stream of results.

## Why Streams?

Streams provide several key benefits:

### Reactive

Operations flow through the system automatically. When you execute a query, it immediately starts flowing through the exchange pipeline.

### Composable

Exchanges are pure functions that transform streams. You can compose multiple exchanges together, and each operates independently on the stream.

### Cancellable

Streams support cancellation. When you stop listening to results (e.g., component unmounts), the operation is cancelled and resources are cleaned up automatically.

### Lazy

Streams are lazy by default. The exchange pipeline only runs when something subscribes to the results.

## Core Concepts

### Source

A **Source** is a stream that emits values. In Mearie, operations flow as a source, and results flow back as another source.

```typescript
type Source<T> = (sink: Sink<T>) => Subscription;
```

### Sink

A **Sink** receives values from a source. It has two methods:

- `next(value)` - Receive a value
- `complete()` - Signal completion

### Subscription

A **Subscription** allows you to cancel a stream and clean up resources:

```typescript
const subscription = source(sink);
subscription.unsubscribe(); // Cancel and cleanup
```

## How Exchanges Use Streams

Every exchange follows this pattern:

```typescript
type Exchange = (input: ExchangeInput) => ExchangeIO;
type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;
```

An exchange:

1. Receives a stream of operations
2. Transforms them (filter, modify, augment)
3. Calls `forward` to pass operations to the next exchange
4. Transforms the results coming back
5. Returns a stream of results

## Example Flow

When you execute a query:

```typescript
const result$ = client.executeQuery(MyQuery, { id: '123' });
```

Here's what happens:

1. Client creates an operation and pushes it to the operations stream
2. Operation flows through each exchange in order
3. Each exchange can transform the operation or pass it along
4. Terminal exchange (http/subscription) executes the request
5. Result flows back through exchanges in reverse
6. Each exchange can transform the result
7. Final result reaches your application

## Mental Model

Think of exchanges as a series of pipes:

```
     Operations Stream
          ↓
    [dedupExchange]  ← Removes duplicate requests
          ↓
    [cacheExchange]  ← Returns cached data or forwards
          ↓
    [httpExchange]   ← Makes network request
          ↓
     Results Stream
```

Each exchange can:

- Observe operations passing through
- Filter or modify operations
- Add new operations to the stream
- Intercept and cache results
- Transform results

## Next Steps

- [Exchanges Guide](/guides/exchanges) - Learn how to compose exchanges
- [Streams API Reference](/references/streams) - Complete API documentation for streams
- [Custom Exchanges](/exchanges/custom) - Build your own exchanges
