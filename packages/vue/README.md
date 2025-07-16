# @mearie/vue

Vue bindings for Mearie GraphQL client.

This package provides Vue composables and plugins for using Mearie in Vue
applications.

## Installation

```bash
npm install mearie @mearie/vue
```

## Usage

```vue
<script setup lang="ts">
import { createClient, httpLink, cacheLink, graphql } from 'mearie';
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
