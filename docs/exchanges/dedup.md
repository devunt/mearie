---
description: Prevent duplicate concurrent requests to reduce unnecessary network traffic. Automatically deduplicates identical queries while preserving mutation safety.
---

# Deduplication Exchange

Prevent duplicate concurrent requests, reducing unnecessary network traffic.

## Basic Usage

```typescript
import { createClient, dedupExchange, httpExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [dedupExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

## How It Works

When multiple identical queries are made concurrently:

1. Identifies duplicate requests (same query + variables)
2. Executes only one request
3. Returns the same result to all waiting callers

## Example

```typescript
// These three calls happen at the same time
const promise1 = client.query(GetUserQuery, { id: '1' });
const promise2 = client.query(GetUserQuery, { id: '1' });
const promise3 = client.query(GetUserQuery, { id: '1' });

// Only ONE network request is made
// All three promises resolve with the same result
await Promise.all([promise1, promise2, promise3]);
```

## Deduplication Key

Requests are considered identical if they have:

- Same query (by hash)
- Same variables (deep equality)

```typescript
// These ARE deduplicated (identical)
client.query(GetUserQuery, { id: '1' });
client.query(GetUserQuery, { id: '1' });

// These are NOT deduplicated (different variables)
client.query(GetUserQuery, { id: '1' });
client.query(GetUserQuery, { id: '2' });
```

## Real-World Example

```tsx
export const UserProfile = ({ userId }: { userId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `),
    { id: userId },
  );

  return <h1>{data.user.name}</h1>;
};

// If multiple UserProfile components mount at once with the same userId,
// only one request is made
<>
  <UserProfile userId="1" />
  <UserProfile userId="1" />
  <UserProfile userId="1" />
</>;
```

## Mutation Safety

Mutations are never deduplicated, even if identical:

```typescript
// Both mutations are executed
const promise1 = client.mutation(CreateUserMutation, { name: 'Alice' });
const promise2 = client.mutation(CreateUserMutation, { name: 'Alice' });

// Two separate network requests are made
await Promise.all([promise1, promise2]);
```

This is because mutations may have side effects and should execute every time.

## Link Chain Placement

Place dedupExchange early in the chain, after retry but before cache:

```typescript
export const client = createClient({
  schema,
  exchanges: [
    retryExchange(),
    dedupExchange(), // After retry, before cache
    cacheExchange(),
    httpExchange({ url: 'https://api.example.com/graphql' }),
  ],
});
```

This ensures deduplication happens before cache lookups.

## Next Steps

- [Cache Exchange](/exchanges/cache) - Add normalized caching
- [Retry Exchange](/exchanges/retry) - Automatically retry failed requests
- [Exchanges](/guides/exchanges) - Learn about the exchange system
