# @mearie/svelte

Svelte bindings for Mearie GraphQL client.

This package provides Svelte stores, utilities, and the GraphQL client runtime
for using Mearie in Svelte applications.

## Installation

```bash
npm install -D mearie
npm install @mearie/svelte
```

The `mearie` package provides build-time code generation, while `@mearie/svelte`
includes the runtime client and Svelte-specific stores.

## Usage

First, create a client and set it up in your app:

```svelte
<!-- src/App.svelte -->
<script lang="ts">
import { createClient, httpLink, cacheLink, setClient } from '@mearie/svelte';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

setClient(client);
</script>
```

Then use it in your components:

```svelte
<!-- src/components/UserProfile.svelte -->
<script lang="ts">
import { graphql } from '$mearie';
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
