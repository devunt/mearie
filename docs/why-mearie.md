---
description: A zero-config GraphQL client with zero boilerplate, complete type safety, and zero runtime overhead. Learn why Mearie is different and see quick examples.
---

# Why Mearie?

Mearie (메아리, meaning "echo" in Korean) is a zero-config GraphQL client for React, Vue, Svelte, Solid, and more.

## Features

- **Zero boilerplate** - Write queries as template literals, no manual type definitions or config needed
- **Complete type safety** - End-to-end types from GraphQL schema to UI components
- **Zero runtime overhead** - GraphQL parsing happens at build time, not in the browser
- **Fragment colocation** - Define data requirements alongside components
- **Normalized caching** - Automatic cache updates across your app
- **Composable links** - Customize behavior with middleware (auth, retry, logging)

## Quick Example

::: code-group

```tsx [React]
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';

export const UserProfile = ({ userId }: { userId: string }) => {
  const { data, loading } = useQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
        }
      }
    `),
    { id: userId },
  );

  if (loading) return <div>Loading...</div>;
  return <h1>{data.user.name}</h1>;
};
```

```vue [Vue]
<script setup lang="ts">
import { graphql } from '~graphql';
import { useQuery } from '@mearie/vue';

const props = defineProps<{ userId: string }>();

const { data, loading } = useQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  () => ({ id: props.userId }),
);
</script>

<template>
  <div v-if="loading">Loading...</div>
  <h1 v-else>{{ data.user.name }}</h1>
</template>
```

```svelte [Svelte]
<script lang="ts">
import { graphql } from '~graphql';
import { createQuery } from '@mearie/svelte';

interface Props {
  userId: string;
}

let { userId }: Props = $props();

const query = createQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  () => ({ id: userId }),
);
</script>

{#if query.loading}
  <div>Loading...</div>
{:else}
  <h1>{query.data.user.name}</h1>
{/if}
```

```tsx [Solid]
import { type Component } from 'solid-js';
import { graphql } from '~graphql';
import { createQuery } from '@mearie/solid';

interface UserProfileProps {
  userId: string;
}

export const UserProfile: Component<UserProfileProps> = (props) => {
  const query = createQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
        }
      }
    `),
    () => ({ id: props.userId }),
  );

  if (query.loading) return <div>Loading...</div>;
  return <h1>{query.data.user.name}</h1>;
};
```

:::

## Next Steps

- [Installation](/getting-started/installation) - Install Mearie
- [Setup](/getting-started/setup) - Configure your project
- [Your First Query](/getting-started/your-first-query) - Write your first query
