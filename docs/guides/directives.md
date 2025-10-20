---
description: Customize GraphQL behavior on the client side with special directives like @required. Learn how directives work at code generation and runtime.
---

# Directives

Customize GraphQL behavior on the client side with special directives.

## What are Directives?

Directives are annotations you add to GraphQL operations (queries, mutations, subscriptions) and fragments that change how Mearie processes and types your data. Unlike standard GraphQL directives (like `@include`, `@skip`), these are processed during code generation and don't affect the actual query sent to the server.

::: tip
These are also known as **client directives** to distinguish them from server-side GraphQL directives. They only exist on the client and are stripped out before sending queries to the server.
:::

## Available Directives

### `@required`

Control field nullability on the client side. Your schema might mark fields as nullable for flexibility, but your client can enforce stricter requirements.

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

[Learn more about @required →](/directives/required)

## How Directives Work

Directives operate at two levels:

### 1. Code Generation Time

During code generation, Mearie analyzes your directives and generates appropriate TypeScript types:

```typescript
// Without @required
type UserQuery$data = {
  name?: string | null;
};

// With @required
type UserQuery$data = {
  name: string; // Now non-null
};
```

### 2. Runtime Execution

Some directives also affect runtime behavior. For example, `@required` throws an error if a field is unexpectedly null:

```typescript
// If name is null, this will throw
const data = useQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        name @required
      }
    }
  `),
);
```

## Next Steps

- [@required](/directives/required) - Control field nullability
- [Fragments](/guides/fragments) - Use directives with fragments
- [Queries](/guides/queries) - Learn about queries and operations
