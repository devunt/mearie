---
description: Svelte stores that work seamlessly with Svelte's fine-grained reactivity and runes for full type safety. Learn about createQuery, createMutation, createFragment, and createSubscription.
---

# Svelte Integration

Mearie provides Svelte stores that work seamlessly with Svelte's fine-grained reactivity and runes for full type safety.

## Installation

Install the core package and the Svelte integration:

::: code-group

```sh [npm]
npm install -D mearie
npm install @mearie/svelte
```

```sh [yarn]
yarn add -D mearie
yarn add @mearie/svelte
```

```sh [pnpm]
pnpm add -D mearie
pnpm add @mearie/svelte
```

```sh [bun]
bun add -D mearie
bun add @mearie/svelte
```

```sh [deno]
deno add --dev npm:mearie
deno add npm:@mearie/svelte
```

:::

## Setup

### 1. Add Build Plugin

Add Mearie's build plugin to enable automatic type generation from your GraphQL documents:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [svelte(), mearie()],
});
```

::: tip
By default, Mearie looks for `./schema.graphql` relative to your `vite.config.ts`. For custom schema locations or advanced configuration, see [Codegen Config](/config/codegen).
:::

### 2. Create Client

Create a GraphQL client with your API endpoint. Import `createClient` and exchanges from `@mearie/svelte`:

```typescript
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/svelte';
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

```svelte
<!-- src/main.svelte -->
<script lang="ts">
  import { setClient } from '@mearie/svelte';
  import { client } from './lib/graphql-client';

  setClient(client);
</script>
```

## Stores

### createQuery

Fetch data with automatic caching:

```svelte
<script lang="ts">
import { graphql } from '$mearie'
import { createQuery } from '@mearie/svelte'

interface Props {
  userId: string;
}

let { userId }: Props = $props()

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
  () => ({ id: userId })
)
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
    <button onclick={() => query.refetch()}>Refresh</button>
  </div>
{/if}
```

### createMutation

Modify data with automatic cache updates:

```svelte
<script lang="ts">
import { graphql } from '$mearie'
import { createMutation } from '@mearie/svelte'

interface Props {
  userId: string;
}

let { userId }: Props = $props()
let name = $state('')

const mutation = createMutation(
  graphql(`
    mutation UpdateUserMutation($id: ID!, $name: String!) {
      updateUser(id: $id, input: { name: $name }) {
        id
        name
      }
    }
  `)
)

const handleSubmit = async (e: SubmitEvent) => {
  e.preventDefault()
  await mutation.mutate({ id: userId, name })
}
</script>

<form onsubmit={handleSubmit}>
  <input bind:value={name} required />
  <button type="submit" disabled={mutation.loading}>
    {mutation.loading ? 'Saving...' : 'Save'}
  </button>
</form>
```

### createFragment

Co-locate data requirements with components:

```svelte
<script lang="ts">
import { graphql } from '$mearie'
import { createFragment } from '@mearie/svelte'
import type { UserCard_user$key } from '$mearie'

interface Props {
  user: UserCard_user$key;
}

let { user }: Props = $props()

const data = createFragment(
  graphql(`
    fragment UserCard_user on User {
      id
      name
      avatar
      email
    }
  `),
  () => user,
)
</script>

<div class="card">
  <img src={data().avatar} alt={data().name} />
  <h3>{data().name}</h3>
  <p>{data().email}</p>
</div>
```

### createSubscription

Real-time updates via subscriptions:

```svelte
<script lang="ts">
import { graphql } from '$mearie'
import { createSubscription } from '@mearie/svelte'

interface Props {
  chatId: string;
}

let { chatId }: Props = $props()

const subscription = createSubscription(
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
  () => ({ chatId })
)
</script>

<div>
  <div>{subscription.loading ? 'Connecting...' : 'Connected'}</div>
  {#if subscription.data?.messageAdded}
    <div>
      <strong>{subscription.data.messageAdded.author.name}:</strong>
      {subscription.data.messageAdded.body}
    </div>
  {/if}
</div>
```

## Fine-Grained Reactivity

Svelte's fine-grained reactivity with runes works seamlessly with Mearie:

```svelte
<script lang="ts">
import { graphql } from '$mearie';
import { createQuery } from '@mearie/svelte';

let userId = $state('123');

// Automatically refetches when userId changes
const query = createQuery(
  graphql(`
    query GetUserQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  () => ({ id: userId })
);
</script>

{#if query.data}
  <div>
    <h1>{query.data.user.name}</h1>
    <p>{query.data.user.email}</p>
  </div>
{/if}

<button onclick={() => userId = '456'}>
  Change User
</button>
```

## Next Steps

- [Queries](/guides/queries) - Learn more about queries
- [Mutations](/guides/mutations) - Learn more about mutations
- [Fragments](/guides/fragments) - Learn more about fragments
- [Subscriptions](/guides/subscriptions) - Learn more about subscriptions
