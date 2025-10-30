---
description: Split complex queries into reusable fragments and colocate data requirements with components for better maintainability and type safety.
---

# Using Fragments

Fragments let you split complex queries into reusable pieces and colocate data requirements with components.

## What Are Fragments?

Fragments define data requirements for a specific component:

```typescript
const UserCard_user = graphql(`
  fragment UserCard_user on User {
    id
    name
    avatar
  }
`);
```

This allows each component to declare exactly what data it needs, instead of parent components knowing all child requirements.

## Define a Fragment

Define a fragment with your component:

::: code-group

```tsx [React]
// src/components/UserCard.tsx
import { graphql } from '$mearie';
import { useFragment } from '@mearie/react';
import type { UserCard_user$key } from '$mearie';

export const UserCard = ({ user }: { user: UserCard_user$key }) => {
  const fragment = useFragment(
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
      <img src={fragment.data.avatar} alt={fragment.data.name} />
      <h3>{fragment.data.name}</h3>
      <p>{fragment.data.email}</p>
    </div>
  );
};
```

```vue [Vue]
<!-- src/components/UserCard.vue -->
<script setup lang="ts">
import { graphql } from '$mearie';
import { useFragment } from '@mearie/vue';
import type { UserCard_user$key } from '$mearie';

const props = defineProps<{ user: UserCard_user$key }>();

const fragment = useFragment(
  graphql(`
    fragment UserCard_user on User {
      id
      name
      avatar
      email
    }
  `),
  () => props.user,
);
</script>

<template>
  <div class="card">
    <img :src="fragment.data.avatar" :alt="fragment.data.name" />
    <h3>{{ fragment.data.name }}</h3>
    <p>{{ fragment.data.email }}</p>
  </div>
</template>
```

```svelte [Svelte]
<!-- src/components/UserCard.svelte -->
<script lang="ts">
import { graphql } from '$mearie';
import { createFragment } from '@mearie/svelte';
import type { UserCard_user$key } from '$mearie';

interface Props {
  user: UserCard_user$key;
}

let { user }: Props = $props();

const fragment = createFragment(
  graphql(`
    fragment UserCard_user on User {
      id
      name
      avatar
      email
    }
  `),
  () => user,
);
</script>

<div class="card">
  <img src={fragment.data.avatar} alt={fragment.data.name} />
  <h3>{fragment.data.name}</h3>
  <p>{fragment.data.email}</p>
</div>
```

```tsx [Solid]
// src/components/UserCard.tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
import { createFragment } from '@mearie/solid';
import type { UserCard_user$key } from '$mearie';

interface UserCardProps {
  user: UserCard_user$key;
}

export const UserCard: Component<UserCardProps> = (props) => {
  const fragment = createFragment(
    graphql(`
      fragment UserCard_user on User {
        id
        name
        avatar
        email
      }
    `),
    () => props.user,
  );

  return (
    <div class="card">
      <img src={fragment.data.avatar} alt={fragment.data.name} />
      <h3>{fragment.data.name}</h3>
      <p>{fragment.data.email}</p>
    </div>
  );
};
```

:::

Each component declares its own data requirements with `useFragment` (or `createFragment` in Svelte/Solid).

## Use the Fragment

Use the fragment in your query:

::: code-group

```tsx [React]
// src/pages/UserProfile.tsx
import { graphql } from '$mearie';
import { useQuery } from '@mearie/react';
import { UserCard } from '../components/UserCard';

export const UserProfile = ({ userId }: { userId: string }) => {
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

  return <UserCard user={data.user} />;
};
```

```vue [Vue]
<!-- src/pages/UserProfile.vue -->
<script setup lang="ts">
import { graphql } from '$mearie';
import { useQuery } from '@mearie/vue';
import UserCard from '../components/UserCard.vue';

const props = defineProps<{ userId: string }>();

const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        ...UserCard_user
      }
    }
  `),
  () => ({ id: props.userId }),
);
</script>

<template>
  <UserCard :user="data.user" />
</template>
```

```svelte [Svelte]
<!-- src/pages/UserProfile.svelte -->
<script lang="ts">
import { graphql } from '$mearie';
import { createQuery } from '@mearie/svelte';
import UserCard from '../components/UserCard.svelte';

interface Props {
  userId: string;
}

let { userId }: Props = $props();

const query = createQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        ...UserCard_user
      }
    }
  `),
  () => ({ id: userId }),
);
</script>

<UserCard user={query.data.user} />
```

```tsx [Solid]
// src/pages/UserProfile.tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
import { createQuery } from '@mearie/solid';
import { UserCard } from '../components/UserCard';

interface UserProfileProps {
  userId: string;
}

export const UserProfile: Component<UserProfileProps> = (props) => {
  const query = createQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          ...UserCard_user
        }
      }
    `),
    () => ({ id: props.userId }),
  );

  return <UserCard user={query.data.user} />;
};
```

:::

TypeScript ensures the fragment is spread in the query and the correct data is passed to the component.

## Next Steps

- [Fragments](/guides/fragments) - Explore advanced fragment patterns
- [Queries](/guides/queries) - Learn more about querying data
- [Mutations](/guides/mutations) - Learn how to modify data
