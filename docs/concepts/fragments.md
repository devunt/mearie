---
description: Learn how fragment colocation keeps data requirements close to components, reduces coupling, and prevents over-fetching as applications grow.
---

# Fragments

Fragments let components declare their own data requirements, keeping your codebase maintainable as it grows.

## The Problem with Centralized Queries

Without fragments, parent components must know every field their children need:

```tsx
const UserProfile = ({ userId }) => {
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          name
          email
          avatar
          bio
          website
          location
          createdAt
        }
      }
    `),
    { id: userId },
  );

  return (
    <div>
      <UserHeader user={data.user} />
      <UserBio user={data.user} />
      <UserStats user={data.user} />
    </div>
  );
};
```

The parent queries eight fields. Which component uses which field? You can't tell from the query. This creates several problems:

### Hidden Dependencies

Components depend on parent queries selecting specific fields. Add a new component or change an existing one, and you must find and update the parent query.

```tsx
const UserWebsite = ({ user }) => {
  return <a href={user.website}>{user.website}</a>;
};
```

This component needs `website`. But if the parent query doesn't include it, the component breaks. The dependency is invisible.

### Over-Fetching

To be safe, parent queries request fields "just in case." Remove a component and its fields remain in the query. Over time, queries accumulate unused fields.

### Coupling

Child components couple tightly to parent queries. Moving a component to a different parent requires updating the new parent's query. Reusing a component means remembering its data requirements.

### Refactoring Friction

Changing what data a component needs requires finding every query that uses that component and updating them all. This friction discourages refactoring.

## Fragment Colocation

Fragments solve this by letting components declare their own data requirements:

```tsx
const UserWebsite = ({ user }) => {
  const fragment = useFragment(
    graphql(`
      fragment UserWebsite_user on User {
        website
      }
    `),
    user,
  );

  return <a href={fragment.data.website}>{fragment.data.website}</a>;
};
```

The component explicitly declares: "I need the `website` field." This declaration lives right next to the code that uses it.

Parents compose fragments instead of listing fields:

```tsx
const UserProfile = ({ userId }) => {
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          ...UserHeader_user
          ...UserBio_user
          ...UserStats_user
          ...UserWebsite_user
        }
      }
    `),
    { id: userId },
  );

  return (
    <div>
      <UserHeader user={data.user} />
      <UserBio user={data.user} />
      <UserStats user={data.user} />
      <UserWebsite user={data.user} />
    </div>
  );
};
```

The parent doesn't know what fields each fragment includes. It doesn't need to know. Each component manages its own requirements.

## Benefits of Colocation

### Visible Dependencies

Data dependencies are explicit. Looking at a component shows exactly what data it needs:

```tsx
fragment UserCard_user on User {
  id
  name
  avatar
  email
}
```

No hunting through parent queries. The fragment documents the component's data contract.

### Accurate Fetching

Components request exactly the fields they use. Add a field to a component, add it to the fragment. Remove a field from the component, remove it from the fragment. The query matches reality.

### Loose Coupling

Components become portable. Move `UserCard` anywhere and its data requirements move with it. The new parent spreads `...UserCard_user` and everything works.

### Safe Refactoring

Change a component's data needs by changing its fragment. TypeScript immediately shows everywhere the component is used. No grepping, no guessing.

## How Fragments Work

### Fragment Definition

Define a fragment with your component:

```tsx
const UserCard = ({ user }: { user: UserCard_user$key }) => {
  const fragment = useFragment(
    graphql(`
      fragment UserCard_user on User {
        name
        avatar
      }
    `),
    user,
  );

  return (
    <div>
      <img src={fragment.data.avatar} />
      <span>{fragment.data.name}</span>
    </div>
  );
};
```

The fragment name follows a convention: `ComponentName_propName`. This makes fragments discoverable and prevents naming collisions.

### Fragment Spreading

Parent queries spread child fragments:

```tsx
const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        ...UserCard_user
      }
    }
  `),
  { id: userId },
);
```

The spread operator `...` includes all fields from `UserCard_user`. GraphQL merges these fields into the final query sent to the server.

### Fragment References

Props use fragment reference types, not the data directly:

```tsx
interface UserCardProps {
  user: UserCard_user$key;
}
```

The `$key` suffix indicates a fragment reference. The component must call `useFragment` to access the data. This enforces the fragment contract at compile time.

## Fragment Composition

Fragments compose into trees matching your component hierarchy:

```tsx
const UserProfile = () => {
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          ...UserHeader_user
          ...UserContent_user
        }
      }
    `),
    { id },
  );

  return (
    <div>
      <UserHeader user={data.user} />
      <UserContent user={data.user} />
    </div>
  );
};

const UserContent = ({ user }) => {
  const fragment = useFragment(
    graphql(`
      fragment UserContent_user on User {
        ...UserBio_user
        ...UserPosts_user
      }
    `),
    user,
  );

  return (
    <div>
      <UserBio user={fragment.data} />
      <UserPosts user={fragment.data} />
    </div>
  );
};
```

The hierarchy:

```
GetUserQuery
├── UserHeader_user
└── UserContent_user
    ├── UserBio_user
    └── UserPosts_user
```

Each fragment spreads its children's fragments. The final query includes fields from all fragments in the tree.

## Type Safety with Fragments

Fragment reference types ensure compile-time safety:

### Missing Fragments

Forget to spread a fragment and TypeScript catches it:

```tsx
const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        name
      }
    }
  `),
  { id: userId },
);

<UserCard user={data.user} />;
```

Error: Type 'User' is not assignable to type 'UserCard_user$key'

The error message tells you exactly which fragment is missing.

### Extra Fields

Fragment types only expose fields declared in the fragment:

```tsx
const fragment = useFragment(
  graphql(`
    fragment UserCard_user on User {
      name
      avatar
    }
  `),
  user,
);

console.log(fragment.data.email);
```

Error: Property 'email' does not exist on type 'UserCard_user'

Components can't access fields they didn't request. This prevents coupling to parent query fields.

## Fragment Best Practices

### Naming Convention

Use `ComponentName_propName` for fragment names:

```tsx
fragment UserCard_user on User { ... }
fragment PostList_posts on Post { ... }
fragment CommentThread_comments on Comment { ... }
```

This makes fragments easy to find and prevents conflicts.

### Single Responsibility

Each fragment should match one component's needs. Don't create shared fragments used by multiple components. Let each component define its own fragment, even if they request similar fields.

### Avoid Fragment Spreading in Queries

Query operations should spread fragments, not select fields directly:

```tsx
query GetUserQuery($id: ID!) {
  user(id: $id) {
    ...UserProfile_user
  }
}
```

Not:

```tsx
query GetUserQuery($id: ID!) {
  user(id: $id) {
    id
    name
    ...UserProfile_user
  }
}
```

Let fragments own all field selections.

## When Not to Use Fragments

Fragments aren't always necessary:

### Root Queries

Top-level queries that don't pass data to reusable components can select fields directly:

```tsx
const { data } = useQuery(
  graphql(`
    query GetPageDataQuery {
      currentUser {
        id
        name
      }
      notifications {
        id
        message
      }
    }
  `),
);
```

### Single-Use Components

Components used in exactly one place don't benefit from fragments. The indirection adds complexity without portability benefits.

### Simple Data Structures

Components displaying very simple data might not need fragments:

```tsx
const UserName = ({ name }: { name: string }) => {
  return <span>{name}</span>;
};
```

This component receives a string, not a fragment reference. Simple props are fine for simple components.

## Fragments and Caching

Fragments work seamlessly with normalized caching. The cache doesn't distinguish between fields selected directly and fields from fragments. Both normalize the same way:

```tsx
fragment UserCard_user on User {
  id
  name
}
```

Creates the same cache entry as:

```tsx
query {
  user {
    id
    name
  }
}
```

Fragments are a developer experience feature. They don't affect caching behavior or runtime performance.

## Next Steps

- [Modern GraphQL](/concepts/modern-graphql) - How fragments fit into modern GraphQL architecture
- [Type Safety](/concepts/type-safety) - How fragment types provide compile-time safety
- [Using Fragments](/getting-started/using-fragments) - Practical guide to using fragments
- [Fragments Guide](/guides/fragments) - Advanced fragment patterns and techniques
