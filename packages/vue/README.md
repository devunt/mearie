# @mearie/vue

Vue bindings for Mearie GraphQL client.

This package provides Vue composables, plugins, and the GraphQL client runtime
for using Mearie in Vue applications.

## Installation

```bash
npm install -D mearie
npm install @mearie/vue
```

The `mearie` package provides build-time code generation, while `@mearie/vue`
includes the runtime client and Vue-specific composables.

## Usage

First, create a client and set up the plugin in your app:

```typescript
// src/main.ts
import { createApp } from 'vue';
import { createClient, httpExchange, cacheExchange, dedupExchange, ClientPlugin } from '@mearie/vue';
import { schema } from '$mearie';
import App from './App.vue';

const client = createClient({
  schema,
  exchanges: [dedupExchange(), cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});

const app = createApp(App);
app.use(ClientPlugin, { client });
app.mount('#app');
```

Then use it in your components:

```vue
<!-- src/components/UserProfile.vue -->
<script setup lang="ts">
import { graphql } from '$mearie';
import { useQuery } from '@mearie/vue';

const props = defineProps<{ userId: string }>();

const { data, loading } = useQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
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

## Documentation

Full documentation is available at <https://mearie.dev/frameworks/vue>.
