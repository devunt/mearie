---
description: Complete technical reference for Mearie's stream system including all types, sources, operators, and sinks.
---

# Streams API Reference

Complete reference for Mearie's stream system. For conceptual understanding, see [Streams Concept](/concepts/streams).

## Core Types

### Source\<T>

A push-based stream that emits values of type `T`.

```typescript
type Source<T> = (sink: Sink<T>) => Subscription;
```

When you call a source with a sink, it:

1. Starts pushing values to the sink
2. Returns a subscription for cancellation

### Sink\<T>

Receives values from a source.

```typescript
type Sink<T> = {
  next(value: T): void; // Receive a value
  complete(): void; // Receive completion signal
};
```

### Subscription

Controls an active stream.

```typescript
type Subscription = {
  unsubscribe(): void; // Cancel stream and cleanup resources
};
```

### Operator\<T, R>

Transforms one source into another.

```typescript
type Operator<T, R = T> = (source: Source<T>) => Source<R>;
```

## Composition

### pipe

Composes operators left-to-right.

```typescript
pipe<T, R>(
  source: Source<T>,
  ...operators: Operator[]
): Source<R>
```

**Example:**

```typescript
const result$ = pipe(
  source$,
  filter((x) => x > 0),
  map((x) => x * 2),
  take(5),
);
```

### compose

Composes operators right-to-left (function composition).

```typescript
compose<T, R>(...operators: Operator[]): Operator<T, R>
```

**Example:**

```typescript
const transform = compose(
  take(5),
  map((x) => x * 2),
  filter((x) => x > 0),
);

const result$ = transform(source$);
```

## Sources

### fromValue

Creates a source that emits a single value then completes.

```typescript
fromValue<T>(value: T): Source<T>
```

**Example:**

```typescript
const source$ = fromValue(42);
```

### fromArray

Creates a source that emits each array element then completes.

```typescript
fromArray<T>(array: readonly T[]): Source<T>
```

**Example:**

```typescript
const source$ = fromArray([1, 2, 3, 4, 5]);
```

### fromPromise

Converts a promise to a source.

```typescript
fromPromise<T>(promise: Promise<T>): Source<T | null>
```

Emits the resolved value or `null` if rejected, then completes.

**Example:**

```typescript
const source$ = fromPromise(fetch('/api/data').then((r) => r.json()));
```

### makeSubject

Creates a subject - a source you can manually push values to.

```typescript
makeSubject<T>(): Subject<T>

type Subject<T> = {
  source: Source<T>;
  next(value: T): void;
  complete(): void;
};
```

**Example:**

```typescript
const subject = makeSubject<number>();

subscribe((value) => console.log(value))(subject.source);

subject.next(1);
subject.next(2);
subject.complete();
```

### fromSubscription

Wraps an external subscription as a source.

```typescript
fromSubscription<T>(
  subscribe: (sink: Sink<T>) => { unsubscribe(): void }
): Source<T>
```

### make

Create a custom source.

```typescript
make<T>(
  onSubscribe: (sink: Sink<T>) => Subscription | void
): Source<T>
```

**Example:**

```typescript
const ticker$ = make((sink) => {
  const id = setInterval(() => sink.next(Date.now()), 1000);
  return { unsubscribe: () => clearInterval(id) };
});
```

## Operators

### filter

Emit only values that pass a predicate.

```typescript
filter<T>(predicate: (value: T) => boolean): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  filter((x) => x % 2 === 0), // Only even numbers
);
```

### map

Transform each value.

```typescript
map<T, R>(transform: (value: T) => R): Operator<T, R>
```

**Example:**

```typescript
pipe(
  source$,
  map((x) => x * 2),
);
```

### mergeMap

Transform each value to a source and merge all sources.

```typescript
mergeMap<T, R>(
  transform: (value: T) => Source<R>
): Operator<T, R>
```

**Example:**

```typescript
pipe(
  operations$,
  mergeMap((op) => fromPromise(fetch(op.url))),
);
```

### take

Emit only the first N values then complete.

```typescript
take<T>(count: number): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  take(5), // First 5 values only
);
```

### takeUntil

Emit values until another source emits.

```typescript
takeUntil<T>(notifier: Source<any>): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  takeUntil(stop$), // Stop when stop$ emits
);
```

### merge

Merge multiple sources into one.

```typescript
merge<T>(...sources: Source<T>[]): Source<T>
```

**Example:**

```typescript
const combined$ = merge(source1$, source2$, source3$);
```

### share

Share a single subscription among multiple subscribers.

```typescript
share<T>(): Operator<T>
```

Without `share`, each subscriber creates a new subscription. With `share`, subscribers share the same underlying subscription.

**Example:**

```typescript
const shared$ = pipe(source$, share());

// Both use the same subscription
subscribe(handleA)(shared$);
subscribe(handleB)(shared$);
```

### tap

Perform side effects without modifying the stream.

```typescript
tap<T>(effect: (value: T) => void): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  tap((x) => console.log('Value:', x)),
  map((x) => x * 2),
);
```

### initialize

Run a function when the stream is first subscribed to.

```typescript
initialize<T>(effect: () => void): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  initialize(() => console.log('Started!')),
);
```

### finalize

Run a cleanup function when the stream completes or is unsubscribed.

```typescript
finalize<T>(cleanup: () => void): Operator<T>
```

**Example:**

```typescript
pipe(
  source$,
  finalize(() => console.log('Cleanup!')),
);
```

## Sinks

### subscribe

Subscribe to a source with an observer.

```typescript
subscribe<T>(observer: Observer<T>): (source: Source<T>) => Subscription

type Observer<T> = {
  next?: (value: T) => void;
  complete?: () => void;
} | ((value: T) => void);
```

**Example:**

```typescript
const subscription = subscribe({
  next: (value) => console.log(value),
  complete: () => console.log('Done'),
})(source$);

// Later...
subscription.unsubscribe();
```

### collect

Collect the first value from a source.

```typescript
collect<T>(source: Source<T>): Promise<T>
```

**Example:**

```typescript
const firstValue = await collect(source$);
```

### collectAll

Collect all values into an array.

```typescript
collectAll<T>(source: Source<T>): Promise<T[]>
```

**Example:**

```typescript
const allValues = await collectAll(source$);
```

### publish

Share a source among multiple subscribers, starting it immediately.

```typescript
publish<T>(source: Source<T>): Source<T>
```

### peek

Subscribe to a source for side effects without holding a reference.

```typescript
peek<T>(observer: Observer<T>): (source: Source<T>) => void
```

## Exchange Pattern

Exchanges use these APIs to transform operation and result streams:

```typescript
const myExchange = (): Exchange => {
  return ({ forward }) => {
    return (ops$) => {
      // Transform operations
      const transformed$ = pipe(ops$, filter(shouldHandle), map(transformOperation));

      // Forward and transform results
      return pipe(transformed$, forward, map(transformResult));
    };
  };
};
```

## Next Steps

- [Streams Concept](/concepts/streams) - Understand the why and what
- [Custom Exchanges](/exchanges/custom) - Build exchanges with these APIs
- [Exchanges Guide](/guides/exchanges) - Learn the exchange system
