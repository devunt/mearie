# `@required` Directive

Control field nullability on the client side.

## Basic Usage

GraphQL schemas define nullability at the server level, but sometimes your client knows better. The `@required` directive lets you enforce stricter nullability requirements based on your application's needs.

```typescript
const UserProfile = ({ userId }: { userId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name @required
          email @required
        }
      }
    `),
    { id: userId },
  );

  // TypeScript knows these are non-null
  return (
    <div>
      <h1>{data.user.name}</h1>
      <p>{data.user.email}</p>
    </div>
  );
};
```

Without `@required`, you'd need null checks everywhere even when you know the data exists.

::: tip Default Action
When you omit the `action` parameter, `THROW` is used by default. So `@required` is equivalent to `@required(action: THROW)`.
:::

## Action Types

The `action` parameter determines what happens when a field is null.

### `THROW` (Default)

Throws an error if the field is null:

```typescript
const PostPage = ({ postId }: { postId: string }) => {
  const { data, error } = useQuery(
    graphql(`
      query GetPost($id: ID!) {
        post(id: $id) {
          id
          title @required
          content @required
        }
      }
    `),
    { id: postId },
  );

  if (error) {
    return <ErrorPage error={error} />;
  }

  return (
    <article>
      <h1>{data.post.title}</h1>
      <p>{data.post.content}</p>
    </article>
  );
};
```

Use this when null values indicate a critical data integrity issue. Handle errors at the query level to provide proper error UI.

### `CASCADE`

Returns null for the entire parent object if the field is null:

```typescript
const UserProfile = ({ userId }: { userId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          avatar @required(action: CASCADE)
        }
      }
    `),
    { id: userId },
  );

  if (!data.user) {
    return <DefaultAvatar />;
  }

  return (
    <div>
      <img src={data.user.avatar} alt={data.user.name} />
      <h1>{data.user.name}</h1>
    </div>
  );
};
```

The parent object becomes nullable when a required field is null. Use this when the component can gracefully handle missing data.

## Common Patterns

### Nested Required Fields

Apply `@required` to nested objects:

```typescript
const CommentPage = ({ commentId }: { commentId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetComment($id: ID!) {
        comment(id: $id) {
          id
          body @required
          author {
            id
            name @required
            avatar @required(action: CASCADE)
          }
        }
      }
    `),
    { id: commentId },
  );

  if (!data.comment.author) {
    return null;
  }

  return (
    <div>
      <img src={data.comment.author.avatar} alt={data.comment.author.name} />
      <p>{data.comment.body}</p>
    </div>
  );
};
```

### Arrays with Required Fields

Filter out items with null required fields:

```typescript
const PostList = () => {
  const { data } = useQuery(
    graphql(`
      query GetPosts {
        posts {
          id
          title @required(action: CASCADE)
        }
      }
    `),
  );

  return (
    <div>
      {data.posts.map((post) =>
        post ? <h2 key={post.id}>{post.title}</h2> : null,
      )}
    </div>
  );
};
```

Posts with null titles are filtered out automatically.

## Best Practices

### Choose the Right Action

- Use `THROW` when null values indicate a critical error that prevents your app from functioning
- Use `CASCADE` when your component can gracefully handle missing data with fallback UI

### Don't Overuse

Only use `@required` when you're confident the server will return non-null values:

```graphql
# Good - Server always returns name for authenticated users
name @required

# Avoid - Profile might legitimately be null
profile @required
```

## Limitations

- `@required` can only make nullable fields non-null. You cannot use it to make non-null fields nullable.

## Next Steps

- [Queries](/guides/queries) - Use `@required` in queries
- [Fragments](/guides/fragments) - Use `@required` with fragments
- [Directives](/guides/directives) - Learn about client directives
