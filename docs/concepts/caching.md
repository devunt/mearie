---
description: Learn how caching eliminates redundant requests and keeps data consistent across your application through normalization and automatic updates.
---

# Caching

Caching stores query results to eliminate redundant network requests and keep your UI responsive.

## The Problem Without Caching

Without caching, every component makes its own request:

```typescript
const UserProfile = ({ userId }) => {
  const { data } = useQuery(GetUserQuery, { id: userId });
  return <div>{data.user.name}</div>;
};

const UserAvatar = ({ userId }) => {
  const { data } = useQuery(GetUserQuery, { id: userId });
  return <img src={data.user.avatar} />;
};
```

Both components request the same user. Two network requests for identical data. If ten components display user information, ten requests fire.

Beyond redundancy, consistency becomes a problem. A mutation updates the user:

```typescript
const { mutate } = useMutation(UpdateUserMutation);

await mutate({ id: userId, name: 'New Name' });
```

The mutation succeeds, but components still display old data. They don't know to refetch. You manually track which queries need updating.

## Document-Based Caching

The simplest caching strategy stores entire query results:

```
Cache:
  GetUserQuery(id: "1") → { user: { id: "1", name: "Alice", email: "..." } }
  GetUserQuery(id: "2") → { user: { id: "2", name: "Bob", email: "..." } }
```

This eliminates redundant requests. The second component reads from cache instead of making a network request.

But consistency problems remain. Two queries requesting the same user with different fields create separate cache entries:

```
Query A: user(id: "1") { name }
Query B: user(id: "1") { name, email }

Cache:
  Query A → { user: { name: "Alice" } }
  Query B → { user: { name: "Alice", email: "alice@example.com" } }
```

Update the user and both entries need manual invalidation. Document caching doesn't understand that both queries reference the same entity.

## Normalized Caching

Normalized caching stores entities separately from queries. The cache indexes data by entity type and ID:

```
Entities:
  User:1 → { id: "1", name: "Alice", email: "alice@example.com" }
  User:2 → { id: "2", name: "Bob", email: "bob@example.com" }

Queries:
  GetUserQuery(id: "1") → ref(User:1)
  GetUserQuery(id: "2") → ref(User:2)
```

Queries store references to entities instead of copies of data. Multiple queries referencing the same entity share one copy in the cache.

### Automatic Updates

When a mutation updates an entity, the cache updates the stored entity. Every query referencing that entity automatically reflects the change:

```typescript
await mutate({ id: '1', name: 'Alicia' });
```

Cache updates:

```
User:1 → { id: "1", name: "Alicia", email: "alice@example.com" }
```

Every component displaying User:1 re-renders with the new name. No manual invalidation needed.

### Partial Data

Normalized caching handles partial data naturally. Different queries request different fields:

```
Query A: user(id: "1") { name }
Query B: user(id: "1") { name, email, avatar }
```

The cache merges fields:

```
User:1 → { id: "1", name: "Alice", email: "alice@example.com", avatar: "..." }
```

Query A reads the `name` field. Query B reads all three. Both reference the same normalized entity.

## How Normalization Works

The cache processes responses in several steps:

### Entity Identification

Each object needs a unique identifier. GraphQL's `id` or `_id` fields serve this purpose:

```graphql
type User {
  id: ID!
  name: String!
}
```

The cache uses `User:${id}` as the cache key. An object without an `id` field can't be normalized and is stored inline with its parent.

### Denormalization

When processing a response, the cache extracts entities and creates references:

```json
{
  "user": {
    "id": "1",
    "name": "Alice",
    "posts": [
      { "id": "10", "title": "Hello" },
      { "id": "11", "title": "World" }
    ]
  }
}
```

Becomes:

```
User:1 → { id: "1", name: "Alice", posts: [ref(Post:10), ref(Post:11)] }
Post:10 → { id: "10", title: "Hello" }
Post:11 → { id: "11", title: "World" }
```

### Reading from Cache

When reading, the cache resolves references recursively. A query requests `user(id: "1") { name, posts { title } }`:

1. Look up `User:1` in the entity cache
2. Read the `name` field
3. Resolve `posts` references
4. Look up `Post:10` and `Post:11`
5. Read `title` from each post
6. Return complete data

## Cache Policies

Control when the cache makes network requests:

### cache-first (default)

Return cached data if available, otherwise fetch from network:

```typescript
const { data } = useQuery(GetUserQuery, { id: userId }, { fetchPolicy: 'cache-first' });
```

Best for data that doesn't change frequently. Provides instant results from cache, only hitting the network for cache misses.

### network-only

Always fetch from network, update cache with results:

```typescript
const { data } = useQuery(GetUserQuery, { id: userId }, { fetchPolicy: 'network-only' });
```

Best for data that must be fresh. Bypasses the cache on initial load but updates it with results.

### cache-only

Only read from cache, never make network requests:

```typescript
const { data } = useQuery(GetUserQuery, { id: userId }, { fetchPolicy: 'cache-only' });
```

Best for offline scenarios or when you know data is already cached.

### cache-and-network

Return cached data immediately, then fetch from network:

```typescript
const { data } = useQuery(GetUserQuery, { id: userId }, { fetchPolicy: 'cache-and-network' });
```

Best for data that changes frequently. Shows instant results while ensuring freshness.

## Cache Consistency

Normalized caching maintains consistency automatically in most cases:

### Mutations

Mutations return updated entities. The cache merges changes automatically:

```typescript
const { mutate } = useMutation(
  graphql(`
    mutation UpdateUserMutation($id: ID!, $name: String!) {
      updateUser(id: $id, input: { name: $name }) {
        id
        name
      }
    }
  `),
);
```

The response contains `id` and `name`. The cache updates `User:${id}` with the new name.

### Subscriptions

Real-time updates flow through the cache:

```typescript
const { data } = useSubscription(
  graphql(`
    subscription OnUserUpdated($id: ID!) {
      userUpdated(id: $id) {
        id
        name
      }
    }
  `),
  { id: userId },
);
```

Each event updates the normalized entity. All components referencing that user re-render with fresh data.

### Refetching

Explicitly refetch queries when needed:

```typescript
const { data, refetch } = useQuery(GetUserQuery, { id: userId });

await refetch();
```

Refetching updates the cache with the latest data from the server.

## Cache Limitations

Normalized caching has constraints:

### Lists

The cache can't automatically update lists when entities are added or removed. Adding a new user requires manually updating queries that list users:

```typescript
const { mutate } = useMutation(CreateUserMutation);

await mutate({ name: 'Charlie' });
```

Existing `GetUsersQuery` results don't include Charlie. You must refetch or manually update the cache.

### Computed Fields

Fields without stable IDs can't be normalized. Computed fields like `fullName` are stored inline:

```graphql
type User {
  id: ID!
  firstName: String!
  lastName: String!
  fullName: String!
}
```

Updating `firstName` doesn't automatically recompute `fullName`. The server must return updated `fullName` in the mutation response.

### Pagination

Paginated data requires careful handling. Different pages of results are separate cache entries:

```
GetUsersQuery(first: 10, after: null) → [User:1, User:2, ...]
GetUsersQuery(first: 10, after: "cursor10") → [User:11, User:12, ...]
```

Loading more results creates a new cache entry instead of appending to the existing list.

## Cache Benefits

Normalized caching provides several advantages:

- **Instant Results** - Cached data displays immediately without loading states
- **Reduced Network Usage** - Fewer requests conserve bandwidth and reduce costs
- **Consistent State** - Updates propagate automatically to all components
- **Optimistic Updates** - Update UI immediately, rollback if mutation fails
- **Offline Support** - Serve cached data when network is unavailable

These benefits compound in large applications where many components display overlapping data.

## Next Steps

- [Modern GraphQL](/concepts/modern-graphql) - Why GraphQL clients include caching
- [Type Safety](/concepts/type-safety) - How types ensure cache correctness
- [Fragments](/concepts/fragments) - How fragments work with the cache
- [Cache Exchange](/exchanges/cache) - Configure and customize caching behavior
