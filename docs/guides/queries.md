---
description: Learn how to fetch data with GraphQL queries, handle loading states and errors, implement pagination, and use query options like fetch policies.
---

# Queries

Learn how to fetch data with queries.

## Basic Query

```tsx
import { graphql } from '$mearie';
import { useQuery } from '@mearie/react';

export const UserProfile = ({ userId }: { userId: string }) => {
  const { data, loading, error } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          name
          email
          avatar
        }
      }
    `),
    { id: userId },
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <h1>{data.user.name}</h1>;
};
```

::: tip Other Frameworks
See [Vue](/frameworks/vue), [Svelte](/frameworks/svelte), or [Solid](/frameworks/solid) for framework-specific examples.
:::

## Query Options

Control query behavior with options:

```typescript
const { data, loading, refetch } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  { id: userId },
  {
    // Skip execution conditionally
    skip: !userId,

    // Cache strategy
    fetchPolicy: 'cache-first', // or 'network-only' | 'cache-only' | 'cache-and-network'
  },
);
```

## Refetching

Queries automatically refetch when variables change:

```tsx
const UserProfile = ({ userId }: { userId: string }) => {
  // Automatically refetches when userId prop changes
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `),
    { id: userId },
  );
  return <div>{data.user.name}</div>;
};
```

If you need more control, you can manually refetch data:

```typescript
const { data, refetch } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }
  `),
  { id: userId },
);

await refetch();
```

## Imperative Queries

Execute queries imperatively:

```typescript
import { graphql } from '$mearie';
import { client } from './lib/graphql-client';

const searchUsers = async (term: string) => {
  const data = await client.query(
    graphql(`
      query SearchQuery($term: String!) {
        search(term: $term) {
          id
          name
        }
      }
    `),
    { term },
  );
  return data.search;
};
```

## Loading States

Handle loading states gracefully:

```typescript
const { data, loading } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }
  `),
  { id },
);

if (loading) {
  return <Skeleton />;
}
```

## Error Handling

Handle errors with the aggregated error object:

```typescript
import { isGraphQLError, isExchangeError } from '@mearie/core';

const { data, error, refetch } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }
  `),
  { id },
);

if (error) {
  // error is an AggregatedError containing all errors
  console.error('Error message:', error.message);
  console.error('All errors:', error.errors);

  // Inspect individual errors
  error.errors.forEach((err) => {
    if (isGraphQLError(err)) {
      console.error('GraphQL error:', err.message, err.path);
    } else if (isExchangeError(err)) {
      console.error('Exchange error from:', err.exchangeName, err.message);
    }
  });

  return (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={() => refetch()}>Try Again</button>
    </div>
  );
}
```

### Error Types

Mearie provides three error types:

- **`GraphQLError`** - Errors from the GraphQL server with `path`, `locations`, and `extensions`
- **`ExchangeError`** - Errors from specific exchanges with `exchangeName` and `extensions`
- **`AggregatedError`** - Container for multiple errors with an `errors` array

Use type guards to handle specific error types:

```typescript
import { isGraphQLError, isExchangeError, isAggregatedError } from '@mearie/core';

if (error) {
  // Check for specific GraphQL errors
  const authErrors = error.errors.filter((err) => isGraphQLError(err) && err.extensions?.code === 'UNAUTHENTICATED');

  // Check for exchange-specific errors
  const networkErrors = error.errors.filter((err) => isExchangeError(err, 'httpExchange'));

  if (authErrors.length > 0) {
    // Handle authentication errors
    redirectToLogin();
  } else if (networkErrors.length > 0) {
    // Handle network errors
    showRetryButton();
  }
}
```

## Pagination

### Offset Pagination

```tsx
const PostList = () => {
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data } = useQuery(
    graphql(`
      query GetPostsQuery($offset: Int!, $limit: Int!) {
        posts(offset: $offset, limit: $limit) {
          id
          title
        }
      }
    `),
    {
      offset: page * limit,
      limit,
    },
  );

  return (
    <div>
      {data.posts.map((post) => (
        <div key={post.id}>{post.title}</div>
      ))}
      <button onClick={() => setPage(page + 1)}>Next</button>
    </div>
  );
};
```

### Cursor Pagination

```tsx
const PostList = () => {
  const [after, setAfter] = useState<string | null>(null);

  const { data } = useQuery(
    graphql(`
      query GetPostsQuery($after: String, $first: Int!) {
        posts(after: $after, first: $first) {
          edges {
            node {
              id
              title
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `),
    { after, first: 10 },
  );

  return (
    <div>
      {data.posts.edges.map((edge) => (
        <div key={edge.node.id}>{edge.node.title}</div>
      ))}
      {data.posts.pageInfo.hasNextPage && (
        <button onClick={() => setAfter(data.posts.pageInfo.endCursor)}>Load More</button>
      )}
    </div>
  );
};
```

## Best Practices

- Name queries with `Query` suffix (e.g., `GetUserQuery`)
- Show loading states to provide user feedback
- Handle errors gracefully with retry options
- Use appropriate fetch policies based on your data freshness requirements

## Next Steps

- [Mutations](/guides/mutations) - Learn how to modify data
- [Fragments](/guides/fragments) - Co-locate data requirements with components
- [Subscriptions](/guides/subscriptions) - Handle real-time updates
