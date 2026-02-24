---
description: Learn how type safety prevents bugs by catching errors at compile time rather than runtime, and how it improves developer experience across your entire stack.
---

<!-- cspell:ignore nmae emial -->

# Type Safety

Type safety catches errors before your code runs, turning runtime bugs into compile-time errors.

## The Problem with Runtime Errors

Without type safety, mistakes only surface when code executes:

```typescript
const { data } = await fetchUser(userId);

console.log(data.user.nmae);
```

This code compiles successfully but crashes at runtime. The typo `nmae` instead of `name` goes unnoticed until a user triggers this code path.

With GraphQL, the problem compounds. Your schema defines what fields exist, but without type generation, nothing ensures your queries match:

```typescript
const query = `
  query {
    user(id: "123") {
      name
      emial
    }
  }
`;
```

The GraphQL server rejects this query because `emial` doesn't exist. But you don't discover this until the request fails in production.

## Compile-Time Validation

Type safety moves these errors to compile time. Your editor shows errors immediately:

```typescript
const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        name
        email
      }
    }
  `),
  { id: userId },
);

console.log(data.user.nmae);
```

TypeScript underlines `nmae` in red. The error appears in your editor before you save, preventing the bug entirely.

## Full-Stack Type Flow

Type safety works across your entire stack:

### Schema → Operations

Your GraphQL schema defines available types and fields. Build tools parse the schema and validate your operations against it. Queries requesting non-existent fields fail at build time:

```typescript
graphql(`
  query {
    user(id: "123") {
      invalidField
    }
  }
`);
```

Error: Field "invalidField" does not exist on type "User"

### Operations → Variables

Type generation creates interfaces for variables. Pass the wrong type and TypeScript catches it:

```typescript
const GetUserQuery = graphql(`
  query GetUserQuery($id: ID!) {
    user(id: $id) {
      name
    }
  }
`);

useQuery(GetUserQuery, { id: 123 });
```

Error: Type 'number' is not assignable to type 'string'

### Variables → Components

Generated types flow through to your components. Access non-existent properties and the compiler stops you:

```typescript
const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        name
        email
      }
    }
  `),
  { id: userId },
);

return <div>{data.user.phoneNumber}</div>;
```

Error: Property 'phoneNumber' does not exist on type 'User'

## Developer Experience Benefits

Type safety provides immediate feedback while coding:

### Autocomplete

Your editor suggests available fields as you type. No need to reference documentation or remember field names:

```typescript
data.user.
```

Autocomplete shows: `id`, `name`, `email`, `avatar`, `bio`, `createdAt`

### Refactoring

Rename a field in your schema and TypeScript shows every usage that needs updating. No grep, no missed references:

1. Rename `email` to `emailAddress` in schema
2. Build fails, showing all locations using `email`
3. Update each location with confidence
4. Build succeeds, nothing broken

### Documentation

Hover over any field to see its type and documentation from your schema:

```typescript
data.user.createdAt;
```

Tooltip shows: `createdAt: DateTime - The date this user was created`

### Null Safety

GraphQL's null semantics transfer to TypeScript. Non-nullable fields in your schema become non-optional properties:

```graphql
type User {
  id: ID!
  name: String!
  bio: String
}
```

Generated TypeScript:

```typescript
interface User {
  id: string;
  name: string;
  bio: string | null;
}
```

Access `bio` without checking and TypeScript warns you:

```typescript
const length = data.user.bio.length;
```

Error: Object is possibly 'null'

## How Type Generation Works

Type generation happens automatically at build time:

1. **Schema Loading** - Build tool reads your GraphQL schema
2. **Operation Extraction** - Parser finds all `graphql()` calls in your code
3. **Validation** - Each operation is validated against the schema
4. **Type Generation** - TypeScript types are generated for each operation
5. **File Output** - Types are written to a generated file

This happens during development as you save files. No separate generation step required.

## Zero Runtime Overhead

Type generation produces only compile-time types. Generated code contains no type information:

```typescript
const GetUserQuery = graphql(`
  query GetUserQuery($id: ID!) {
    user(id: $id) {
      name
    }
  }
`);
```

Compiles to:

```javascript
const GetUserQuery = {
  query: 'query GetUserQuery($id: ID!) { user(id: $id) { name } }',
  operationName: 'GetUserQuery',
};
```

No types in the bundle. All type safety at compile time, zero cost at runtime.

## Beyond Basic Types

Advanced type features handle complex scenarios:

### Conditional Fields

Fields selected conditionally are typed as optional:

```typescript
graphql(`
  query GetUserQuery($id: ID!, $includeBio: Boolean!) {
    user(id: $id) {
      name
      bio @include(if: $includeBio)
    }
  }
`);
```

Generated type:

```typescript
interface GetUserQueryData {
  user: {
    name: string;
    bio?: string | null;
  };
}
```

### Unions and Interfaces

GraphQL unions and interfaces map to TypeScript discriminated unions:

```graphql
interface Node {
  id: ID!
}

type User implements Node {
  id: ID!
  name: String!
}

type Post implements Node {
  id: ID!
  title: String!
}
```

Generated types use `__typename` for discrimination:

```typescript
type Node = { __typename: 'User'; id: string; name: string } | { __typename: 'Post'; id: string; title: string };
```

TypeScript narrows types based on `__typename`:

```typescript
if (node.__typename === 'User') {
  console.log(node.name);
}
```

### Fragment Types

Fragments generate reusable type fragments:

```typescript
const UserCard_user = graphql(`
  fragment UserCard_user on User {
    name
    avatar
  }
`);
```

Component props use generated fragment reference types:

```typescript
interface UserCardProps {
  user: UserCard_user$key;
}
```

This ensures the fragment is spread correctly in parent queries.

## Type Safety vs Runtime Safety

Type safety catches errors at compile time but doesn't validate runtime data. If your server returns unexpected data, TypeScript can't help:

```typescript
const data = { user: { name: 123 } };
```

This satisfies TypeScript if typed as `{ user: { name: string } }` but crashes at runtime when you try `name.toUpperCase()`.

GraphQL provides runtime schema validation server-side. Your server rejects malformed responses before they reach the client. This combines with compile-time types for comprehensive safety.

## Next Steps

- [Modern GraphQL](/concepts/modern-graphql) - Why GraphQL clients exist
- [Caching](/concepts/caching) - How data stays consistent across your app
- [Fragments](/concepts/fragments) - How fragments enable component-level types
- [Your First Query](/getting-started/your-first-query) - See type safety in action
