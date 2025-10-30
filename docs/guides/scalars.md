---
description: Transform custom GraphQL scalars like DateTime, JSON, and UUID into native JavaScript types with automatic parsing and serialization.
---

# Scalars

Transform custom GraphQL scalars into native JavaScript types automatically.

## What are Custom Scalars?

GraphQL includes built-in scalars (`String`, `Int`, `Float`, `Boolean`, `ID`), but many APIs define custom scalars for specialized types like `DateTime`, `JSON`, or `UUID`. Without configuration, these are treated as `unknown` in TypeScript.

## Two-Step Configuration

Working with custom scalars requires two configurations:

1. **Codegen**: Map scalars to TypeScript types
2. **Client**: Transform values between GraphQL and JavaScript

## Codegen Configuration

Configure type mappings in `mearie.config.ts`:

```typescript
import { defineConfig } from 'mearie';

export default defineConfig({
  // ...
  scalars: {
    DateTime: 'Date',
    JSON: 'Record<string, any>',
    UUID: 'string',
  },
});
```

## Client Configuration

Configure runtime transformations when creating your client:

```typescript
import { createClient, httpExchange } from '@mearie/react';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [httpExchange({ url: 'https://api.example.com/graphql' })],
  scalars: {
    DateTime: {
      parse: (value) => new Date(value as string),
      serialize: (value) => value.toISOString(),
    },
    JSON: {
      parse: (value) => JSON.parse(value as string),
      serialize: (value) => JSON.stringify(value),
    },
  },
});
```

## Basic Usage

```typescript
export const PostList = () => {
  const { data } = useQuery(
    graphql(`
      query GetPosts {
        posts {
          id
          title
          publishedAt
        }
      }
    `),
  );

  return (
    <div>
      {data.posts.map((post) => (
        <div key={post.id}>
          <h2>{post.title}</h2>
          {/* publishedAt is a Date object */}
          <time>{post.publishedAt.toLocaleDateString()}</time>
        </div>
      ))}
    </div>
  );
};
```

## Usage in Variables

Scalar transformations work automatically when passing variables:

```typescript
export const CreatePost = () => {
  const [createPost] = useMutation(
    graphql(`
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          id
          publishedAt
        }
      }
    `),
  );

  const handleSubmit = () => {
    createPost({
      input: {
        title: 'New Post',
        publishedAt: new Date(), // Automatically serialized
      },
    });
  };

  // ...
};
```

## Common Configurations

### DateTime & Date

```typescript
// mearie.config.ts
export default defineConfig({
  scalars: {
    DateTime: 'Date',
    Date: 'Date',
  },
});

// Client config
export const client = createClient({
  // ...
  scalars: {
    DateTime: {
      parse: (value) => new Date(value as string),
      serialize: (value) => value.toISOString(),
    },
    Date: {
      parse: (value) => new Date(value as string),
      serialize: (value) => value.toISOString().split('T')[0],
    },
  },
});
```

### JSON

```typescript
// mearie.config.ts
export default defineConfig({
  scalars: {
    JSON: 'any',
  },
});

// Client config
export const client = createClient({
  // ...
  scalars: {
    JSON: {
      parse: (value) => JSON.parse(value as string),
      serialize: (value) => JSON.stringify(value),
    },
  },
});
```

## Null Values

Transform functions are not called when the value is `null`. Mearie automatically handles `null` values without transformation, so you don't need to add null checks in your `parse` and `serialize` functions.

## Best Practices

- Always configure both codegen and client for custom scalars that need transformation
- Keep transformations simple and fast

## Next Steps

- [Queries](/guides/queries) - Use custom scalars in queries
- [Mutations](/guides/mutations) - Use custom scalars in mutations
- [Codegen Config](/config/codegen) - Advanced codegen configuration
