---
description: Learn how to co-locate data requirements with components using fragments. Explore fragment composition, nested fragments, and inline fragments for unions.
---

# Fragments

Learn how to co-locate data requirements with components using fragments.

## Fragment Colocation

Fragments let each component declare its own data requirements, eliminating tight coupling between parent and child components.

**Without fragments:**

```typescript
// ❌ Parent knows too much about child components
const UserProfile = ({ userId }: { userId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          # UserHeader needs these
          id
          name
          avatar

          # UserBio needs these
          bio
          location
          website

          # UserStats needs these
          followerCount
          followingCount
          postCount
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

**With fragments:**

```typescript
// UserHeader.tsx - Component declares its own needs
export const UserHeader = ({ user }: { user: UserHeader_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment UserHeader_user on User {
        id
        name
        avatar
      }
    `),
    user,
  );
  return <h1>{data.name}</h1>;
};

// UserProfile.tsx - Parent just spreads fragments
const UserProfile = ({ userId }: { userId: string }) => {
  const { data } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          ...UserHeader_user
          ...UserBio_user
          ...UserStats_user
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

::: tip Other Frameworks
See [Vue](/frameworks/vue), [Svelte](/frameworks/svelte), or [Solid](/frameworks/solid) for framework-specific examples.
:::

## Basic Usage

Define a fragment with your component:

```typescript
import { graphql } from '~graphql';
import { useFragment } from '@mearie/react';
import type { UserCard_user$key } from '~graphql';

export const UserCard = ({ user }: { user: UserCard_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment UserCard_user on User {
        id
        name
        avatar
        email
      }
    `),
    user,
  );

  return (
    <div className="card">
      <img src={data.avatar} alt={data.name} />
      <h3>{data.name}</h3>
      <p>{data.email}</p>
    </div>
  );
};
```

Spread the fragment in your query:

```typescript
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';
import { UserCard } from './UserCard';

export const UserList = () => {
  const { data } = useQuery(
    graphql(`
      query GetUsersQuery {
        users {
          id
          ...UserCard_user
        }
      }
    `),
  );

  return (
    <div>
      {data.users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};
```

## Fragment Composition

Fragments can include other fragments:

```typescript
// UserAvatar.tsx
export const UserAvatar = ({ user }: { user: UserAvatar_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment UserAvatar_user on User {
        id
        avatar
        name
      }
    `),
    user,
  );
  return <img src={data.avatar} alt={data.name} />;
};

// UserCard.tsx - Reuses UserAvatar_user
export const UserCard = ({ user }: { user: UserCard_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment UserCard_user on User {
        id
        ...UserAvatar_user
        name
        email
      }
    `),
    user,
  );

  return (
    <div>
      <UserAvatar user={data} />
      <h3>{data.name}</h3>
      <p>{data.email}</p>
    </div>
  );
};
```

Fragments work with nested data:

```typescript
// PostAuthor.tsx
export const PostAuthor = ({ author }: { author: PostAuthor_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment PostAuthor_user on User {
        id
        name
        avatar
      }
    `),
    author,
  );
  return <div>{data.name}</div>;
};

// PostItem.tsx - Nested fragment
export const PostItem = ({ post }: { post: PostItem_post$key }) => {
  const data = useFragment(
    graphql(`
      fragment PostItem_post on Post {
        id
        title
        content
        author {
          ...PostAuthor_user
        }
      }
    `),
    post,
  );

  return (
    <article>
      <h2>{data.title}</h2>
      <p>{data.content}</p>
      <PostAuthor author={data.author} />
    </article>
  );
};
```

## Inline Fragments

Use inline fragments for unions and interfaces:

```typescript
export const SearchResultItem = ({ result }: { result: SearchResultItem_result$key }) => {
  const data = useFragment(
    graphql(`
      fragment SearchResultItem_result on SearchResult {
        ... on User {
          id
          name
          avatar
        }
        ... on Post {
          id
          title
          excerpt
        }
      }
    `),
    result,
  );

  if (data.__typename === 'User') {
    return <UserCard user={data} />;
  }

  if (data.__typename === 'Post') {
    return <PostCard post={data} />;
  }

  return null;
};
```

## Best Practices

- Name fragments with `{ComponentName}_{typename}` pattern (e.g., `UserCard_user`, `PostItem_post`)
- Co-locate fragments with their components in the same file

## Next Steps

- [Queries](/guides/queries) - Use fragments in queries
- [Mutations](/guides/mutations) - Use fragments in mutations
- [Links](/guides/links) - Customize request/response handling
