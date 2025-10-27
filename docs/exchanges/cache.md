---
description: Normalized caching with automatic dependency tracking and fine-grained updates. Configure fetch policies and enable progressive enhancement.
---

# Cache Exchange

Normalized caching with automatic dependency tracking and fine-grained updates.

## Basic Usage

```typescript
import { createClient, cacheExchange, httpExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

## How It Works

- **Normalize** - Breaks down responses into entities (e.g., `User:123`)
- **Store** - Saves entities in a normalized map
- **Track** - Registers which queries depend on which entities
- **Invalidate** - Updates only affected queries when data changes

## Configuration

### Fetch Policy

Set default caching behavior:

```typescript
export const client = createClient({
  schema,
  exchanges: [
    cacheExchange({
      fetchPolicy: 'cache-first', // Default for all operations
    }),
    httpExchange({ url: 'https://api.example.com/graphql' }),
  ],
});
```

Available policies:

- **cache-first** (default) - Use cache if available, otherwise fetch
- **cache-and-network** - Return cached data immediately, then fetch and update
- **network-only** - Always fetch from network, update cache
- **cache-only** - Only use cache, throw error if not found

::: info
Mutations and subscriptions always use `network-only` fetch policy, regardless of the configured default.
:::

You can override this per operation. See [Per-Operation Fetch Policy](#per-operation-fetch-policy).

## Automatic Cache Updates

Cache automatically updates when mutations return data:

```typescript
export const EditUser = ({ userId }: { userId: string }) => {
  const [updateUser] = useMutation(
    graphql(`
      mutation UpdateUser($id: ID!, $name: String!) {
        updateUser(id: $id, input: { name: $name }) {
          id
          name
        }
      }
    `),
  );

  const handleSubmit = async (name: string) => {
    await updateUser({ id: userId, name });
    // Cache automatically updates User:${userId} with new name
    // All components using this user re-render automatically
  };

  // ...
};
```

## Per-Operation Fetch Policy

Override the default fetch policy for specific queries:

```typescript
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
    { fetchPolicy: 'network-only' }, // Override default
  );

  return <h1>{data.user.name}</h1>;
};
```

::: warning
Mutations and subscriptions always use `network-only` and cannot be overridden.
:::

## Progressive Enhancement

Cache is completely optional. Start without it:

```typescript
export const client = createClient({
  schema,
  exchanges: [httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

Add caching later with one line - components automatically benefit:

```typescript
export const client = createClient({
  schema,
  exchanges: [cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});
```

## Link Chain Placement

Place cacheExchange before httpExchange:

```typescript
export const client = createClient({
  schema,
  exchanges: [
    retryExchange(),
    dedupExchange(),
    cacheExchange(), // Before HTTP
    httpExchange({ url: 'https://api.example.com/graphql' }),
  ],
});
```

This ensures cache is checked before making network requests.

## Next Steps

- [Retry Exchange](/exchanges/retry) - Automatically retry failed requests
- [Deduplication Exchange](/exchanges/dedup) - Prevent duplicate requests
- [Exchanges](/guides/exchanges) - Learn about the exchange system
