---
description: Solid primitives that leverage fine-grained reactivity for optimal performance and full type safety. Learn about createQuery, createMutation, createFragment, and createSubscription.
---

# Solid Integration

Mearie provides Solid primitives that leverage fine-grained reactivity for optimal performance and full type safety.

## Installation

Install the core package and the Solid integration:

::: code-group

```sh [npm]
npm install -D mearie
npm install @mearie/solid
```

```sh [yarn]
yarn add -D mearie
yarn add @mearie/solid
```

```sh [pnpm]
pnpm add -D mearie
pnpm add @mearie/solid
```

```sh [bun]
bun add -D mearie
bun add @mearie/solid
```

```sh [deno]
deno add --dev npm:mearie
deno add npm:@mearie/solid
```

:::

## Setup

### 1. Add Build Plugin

Add Mearie's build plugin to enable automatic type generation from your GraphQL documents:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [solid(), mearie()],
});
```

::: tip
By default, Mearie looks for `./schema.graphql` relative to your `vite.config.ts`. For custom schema locations or advanced configuration, see [Codegen Config](/config/codegen).
:::

### 2. Create Client

Create a GraphQL client with your API endpoint. Import `createClient` and exchanges from `@mearie/solid`:

```typescript
// src/lib/graphql-client.ts
import { createClient, httpExchange, cacheExchange, dedupExchange } from '@mearie/solid';
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

```tsx
// src/index.tsx
import { ClientProvider } from '@mearie/solid';
import { client } from './lib/graphql-client';

<ClientProvider client={client}>
  <App />
</ClientProvider>;
```

## Primitives

### createQuery

Fetch data with fine-grained reactivity:

```tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
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
    () => ({
      id: props.userId,
    }),
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
      <button onClick={() => query.refetch()}>Refresh</button>
    </div>
  );
};
```

`query.previousData` holds data from a previous set of variables — never an earlier value of the current ones. While a new set of variables loads, `query.data` is `undefined` but `query.previousData` still holds that earlier result, so `query.data ?? query.previousData` keeps the current view rendered instead of falling back to a loading state. See [Data Ownership](/guides/queries#data-ownership) for the full contract.

Once the new variables produce a result, `query.previousData` becomes a structural snapshot rather than the live store node. While the new variables are still loading it is still the node `query.data` was, and the store rewrites that node in place when the result lands — so read `query.previousData` where you need it instead of retaining it across the transition.

### createMutation

Modify data with automatic cache updates:

```tsx
import { type Component, createSignal } from 'solid-js';
import { graphql } from '$mearie';
import { createMutation } from '@mearie/solid';

interface EditUserFormProps {
  userId: string;
}

export const EditUserForm: Component<EditUserFormProps> = (props) => {
  const [name, setName] = createSignal('');
  const [updateUser, mutation] = createMutation(
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
    await updateUser({ id: props.userId, name: name() });
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

### createFragment

Co-locate data requirements with components:

```tsx
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

### createSubscription

Real-time updates via subscriptions:

```tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
import { createSubscription } from '@mearie/solid';

interface ChatMessagesProps {
  chatId: string;
}

export const ChatMessages: Component<ChatMessagesProps> = (props) => {
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
    () => ({ chatId: props.chatId }),
  );

  return (
    <div>
      <div>{subscription.loading ? 'Connecting...' : 'Connected'}</div>
      {subscription.data?.messageAdded && (
        <div>
          <strong>{subscription.data.messageAdded.author.name}:</strong>
          {subscription.data.messageAdded.body}
        </div>
      )}
    </div>
  );
};
```

`subscription.data` holds the latest event only, and `subscription.previousData` holds the last event received under a previous set of variables.

## Fine-Grained Reactivity

Solid's fine-grained reactivity works seamlessly with Mearie:

```tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
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
        }
      }
    `),
    () => ({
      id: props.userId,
    }),
  );

  return (
    <div>
      <h1>{query.data.user.name}</h1>
      <p>{query.data.user.email}</p>
    </div>
  );
};
```

Re-execution depends on exactly three things: the observer key (the document and its variables), `skip`, and the `fetchPolicy` value. Each is tracked through an equality-gated `createMemo`, and everything else is read untracked at execution time, so other reactive values you read inside the `variables` or options accessors do not re-trigger the query on their own.

A variables change is applied before the next render rather than at the moment you write it, so a synchronous read taken immediately after the write — before the update propagates — can still observe the transitional state.

## Next Steps

- [Queries](/guides/queries) - Learn more about queries
- [Mutations](/guides/mutations) - Learn more about mutations
- [Fragments](/guides/fragments) - Learn more about fragments
- [Subscriptions](/guides/subscriptions) - Learn more about subscriptions
