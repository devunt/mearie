---
description: Vue composables that integrate seamlessly with Vue's reactive system for automatic query refetching and full type safety. Learn about useQuery, useMutation, useFragment, and useSubscription.
---

# Vue Integration

Mearie provides Vue composables that integrate seamlessly with Vue's reactive system for automatic query refetching and full type safety.

## Installation

Install the core package and the Vue integration:

::: code-group

```sh [npm]
npm install -D mearie
npm install @mearie/vue
```

```sh [yarn]
yarn add -D mearie
yarn add @mearie/vue
```

```sh [pnpm]
pnpm add -D mearie
pnpm add @mearie/vue
```

```sh [bun]
bun add -D mearie
bun add @mearie/vue
```

```sh [deno]
deno add --dev npm:mearie
deno add npm:@mearie/vue
```

:::

## Setup

### 1. Add Build Plugin

Add Mearie's build plugin to enable automatic type generation from your GraphQL documents:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [vue(), mearie()],
});
```

::: tip
By default, Mearie looks for `./schema.graphql` relative to your `vite.config.ts`. For custom schema locations or advanced configuration, see [Codegen Config](/config/codegen).
:::

### 2. Create Client

Create a GraphQL client with your API endpoint. Import `createClient` and exchanges from `@mearie/vue`:

```typescript
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/vue';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

See [Exchanges](/guides/exchanges) for more details on available exchanges and middleware.

### 3. Set Up Provider

Wrap your app with the client provider to make the GraphQL client available throughout your component tree:

```ts
// src/main.ts
import { ClientPlugin } from '@mearie/vue';
import { client } from './lib/graphql-client';

app.use(ClientPlugin, { client });
```

## Composables

### useQuery

Fetch data with automatic caching:

```vue
<script setup lang="ts">
import { graphql } from '$mearie';
import { useQuery } from '@mearie/vue';

const props = defineProps<{ userId: string }>();

const { data, loading, error, refetch } = useQuery(
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
    <button @click="refetch()">Refresh</button>
  </div>
</template>
```

### useMutation

Modify data with automatic cache updates:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { graphql } from '$mearie';
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

### useFragment

Co-locate data requirements with components:

```vue
<script setup lang="ts">
import { graphql } from '$mearie';
import { useFragment } from '@mearie/vue';
import type { UserCard_user$key } from '$mearie';

const props = defineProps<{ user: UserCard_user$key }>();

const data = useFragment(
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
    <img :src="data.avatar" :alt="data.name" />
    <h3>{{ data.name }}</h3>
    <p>{{ data.email }}</p>
  </div>
</template>
```

### useSubscription

Real-time updates via subscriptions:

```vue
<script setup lang="ts">
import { graphql } from '$mearie';
import { useSubscription } from '@mearie/vue';

const props = defineProps<{ chatId: string }>();

const { data, loading } = useSubscription(
  graphql(`
    subscription MessageAddedSubscription($chatId: ID!) {
      messageAdded(chatId: $chatId) {
        id
        body
        author {
          name
        }
      }
    }
  `),
  () => ({ chatId: props.chatId }),
);
</script>

<template>
  <div>
    <div>{{ loading ? 'Connecting...' : 'Connected' }}</div>
    <div v-if="data?.messageAdded">
      <strong>{{ data.messageAdded.author.name }}:</strong>
      {{ data.messageAdded.body }}
    </div>
  </div>
</template>
```

## Reactive Variables

Variables automatically track Vue reactivity:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { graphql } from '$mearie';
import { useQuery } from '@mearie/vue';

const userId = ref('123');

// Automatically refetches when userId changes
const { data } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  () => ({ id: userId.value }),
);

// Or with computed
const variables = computed(() => ({ id: userId.value }));
const { data: data2 } = useQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  variables,
);
</script>

<template>
  <div v-if="data">
    <h1>{{ data.user.name }}</h1>
  </div>
</template>
```

## Next Steps

- [Queries](/guides/queries) - Learn more about queries
- [Mutations](/guides/mutations) - Learn more about mutations
- [Fragments](/guides/fragments) - Learn more about fragments
- [Subscriptions](/guides/subscriptions) - Learn more about subscriptions
