# @mearie/svelte

Svelte bindings for Mearie GraphQL client.

This package provides Svelte stores and utilities for using Mearie in Svelte
applications.

## Installation

```bash
npm install mearie @mearie/svelte
```

## Usage

```svelte
<script lang="ts">
import { createClient, httpLink, cacheLink, graphql } from 'mearie';
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

## Documentation

Full documentation is available at <https://mearie.dev/frameworks/svelte>.
