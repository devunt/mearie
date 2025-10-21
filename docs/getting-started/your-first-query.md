---
description: Write your first GraphQL query and mutation with full type safety and automatic type generation. Learn how to handle loading states and errors.
---

# Your First Query

Write your first GraphQL query with full type safety.

## Write a Query

Write a GraphQL query directly in your component using the `graphql` function:

::: tip Template Literals
The `graphql` function requires template literals (backticks) for build-time type generation. Template literal interpolation (`${...}`) is not supported. Use GraphQL variables instead.
:::

::: code-group

<!-- prettier-ignore-start -->
```tsx twoslash mearie [React]
// src/components/UserProfile.tsx
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';

interface UserProfileProps {
  userId: string;
}

export const UserProfile = ({ userId }: UserProfileProps) => {
  const { data, loading, error } = useQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          name
          email
          avatar
          bio
          age
        }
      }
    `),
    { id: userId },
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <img src={data.user.avatar} alt={data.user.name} />
      <h1>{data.user.name}</h1>
      {data.user.bio && <p>{data.user.bio}</p>}
      <p>
        Email: {data.user.email}
        //                ^?
      </p>
      <p>
        Age: {data.user.age}
        //              ^?
      </p>
    </div>
  );
};
```
<!-- prettier-ignore-end -->

```vue [Vue]
<!-- src/components/UserProfile.vue -->
<script setup lang="ts">
import { graphql } from '~graphql';
import { useQuery } from '@mearie/vue';

const props = defineProps<{ userId: string }>();

const { data, loading, error } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
        avatar
        bio
        age
      }
    }
  `),
  () => ({ id: props.userId }),
);
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <img :src="data.user.avatar" :alt="data.user.name" />
    <h1>{{ data.user.name }}</h1>
    <p v-if="data.user.bio">{{ data.user.bio }}</p>
    <p>Email: {{ data.user.email }}</p>
    <p>Age: {{ data.user.age }}</p>
  </div>
</template>
```

```svelte [Svelte]
<!-- src/components/UserProfile.svelte -->
<script lang="ts">
import { graphql } from '~graphql';
import { createQuery } from '@mearie/svelte';

interface Props {
  userId: string;
}

let { userId }: Props = $props();

const query = createQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
        avatar
        bio
        age
      }
    }
  `),
  () => ({ id: userId }),
);
</script>

{#if query.loading}
  <div>Loading...</div>
{:else if query.error}
  <div>Error: {query.error.message}</div>
{:else}
  <div>
    <img src={query.data.user.avatar} alt={query.data.user.name} />
    <h1>{query.data.user.name}</h1>
    {#if query.data.user.bio}
      <p>{query.data.user.bio}</p>
    {/if}
    <p>Email: {query.data.user.email}</p>
    <p>Age: {query.data.user.age}</p>
  </div>
{/if}
```

```tsx [Solid]
// src/components/UserProfile.tsx
import { type Component } from 'solid-js';
import { graphql } from '~graphql';
import { createQuery } from '@mearie/solid';

interface UserProfileProps {
  userId: string;
}

export const UserProfile: Component<UserProfileProps> = (props) => {
  const query = createQuery(
    graphql(`
      query GetUserQuery($id: ID!) {
        user(id: $id) {
          id
          name
          email
          avatar
          bio
          age
        }
      }
    `),
    () => ({ id: props.userId }),
  );

  if (query.loading) return <div>Loading...</div>;
  if (query.error) return <div>Error: {query.error.message}</div>;

  return (
    <div>
      <img src={query.data.user.avatar} alt={query.data.user.name} />
      <h1>{query.data.user.name}</h1>
      {query.data.user.bio && <p>{query.data.user.bio}</p>}
      <p>Email: {query.data.user.email}</p>
      <p>Age: {query.data.user.age}</p>
    </div>
  );
};
```

:::

The build plugin automatically generates TypeScript types as you save. No separate type generation step needed.

## Write a Mutation

Write a mutation directly in your component:

::: code-group

```tsx twoslash mearie [React]
import { useState } from 'react';
import { graphql } from '~graphql';
import { useMutation } from '@mearie/react';

interface EditUserFormProps {
  userId: string;
}

export const EditUserForm = ({ userId }: EditUserFormProps) => {
  const [name, setName] = useState('');
  const [updateUser, { loading }] = useMutation(
    graphql(`
      mutation UpdateUserMutation($id: ID!, $name: String!) {
        updateUser(id: $id, input: { name: $name }) {
          id
          name
        }
      }
    `),
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await updateUser({ id: userId, name });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} required />
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
};
```

```vue [Vue]
<script setup lang="ts">
import { ref } from 'vue';
import { graphql } from '~graphql';
import { useMutation } from '@mearie/vue';

const props = defineProps<{ userId: string }>();
const name = ref('');

const { mutate, loading } = useMutation(
  graphql(`
    mutation UpdateUserMutation($id: ID!, $name: String!) {
      updateUser(id: $id, input: { name: $name }) {
        id
        name
      }
    }
  `),
);

const handleSubmit = async () => {
  await mutate({ id: props.userId, name: name.value });
};
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="name" required />
    <button :disabled="loading">{{ loading ? 'Saving...' : 'Save' }}</button>
  </form>
</template>
```

```svelte [Svelte]
<script lang="ts">
import { graphql } from '~graphql';
import { createMutation } from '@mearie/svelte';

interface Props {
  userId: string;
}

let { userId }: Props = $props();
let name = $state('');

const mutation = createMutation(
  graphql(`
    mutation UpdateUserMutation($id: ID!, $name: String!) {
      updateUser(id: $id, input: { name: $name }) {
        id
        name
      }
    }
  `),
);

const handleSubmit = async (e: SubmitEvent) => {
  e.preventDefault();
  await mutation.mutate({ id: userId, name });
};
</script>

<form onsubmit={handleSubmit}>
  <input bind:value={name} required />
  <button type="submit" disabled={mutation.loading}>
    {mutation.loading ? 'Saving...' : 'Save'}
  </button>
</form>
```

```tsx [Solid]
import { type Component, createSignal } from 'solid-js';
import { graphql } from '~graphql';
import { createMutation } from '@mearie/solid';

interface EditUserFormProps {
  userId: string;
}

export const EditUserForm: Component<EditUserFormProps> = (props) => {
  const [name, setName] = createSignal('');
  const mutation = createMutation(
    graphql(`
      mutation UpdateUserMutation($id: ID!, $name: String!) {
        updateUser(id: $id, input: { name: $name }) {
          id
          name
        }
      }
    `),
  );

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    await mutation.mutate({ id: props.userId, name: name() });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={name()} onInput={(e) => setName(e.currentTarget.value)} required />
      <button type="submit" disabled={mutation.loading}>
        {mutation.loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
};
```

:::

When the mutation completes, Mearie automatically updates the cache and re-renders affected components.

## Next Steps

- [Using Fragments](/getting-started/using-fragments) - Split queries into reusable fragments
- [Queries](/guides/queries) - Learn more about querying data
- [Mutations](/guides/mutations) - Learn how to modify data
