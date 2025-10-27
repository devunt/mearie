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
import { schema } from '~graphql';

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

### createMutation

Modify data with automatic cache updates:

```tsx
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

### createFragment

Co-locate data requirements with components:

```tsx
import { type Component } from 'solid-js';
import { graphql } from '~graphql';
import { createFragment } from '@mearie/solid';
import type { UserCard_user$key } from '~graphql';

interface UserCardProps {
  user: UserCard_user$key;
}

export const UserCard: Component<UserCardProps> = (props) => {
  const data = createFragment(
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
      <img src={data().avatar} alt={data().name} />
      <h3>{data().name}</h3>
      <p>{data().email}</p>
    </div>
  );
};
```

### createSubscription

Real-time updates via subscriptions:

```tsx
import { type Component } from 'solid-js';
import { graphql } from '~graphql';
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

## Fine-Grained Reactivity

Solid's fine-grained reactivity works seamlessly with Mearie:

```tsx
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

## Next Steps

- [Queries](/guides/queries) - Learn more about queries
- [Mutations](/guides/mutations) - Learn more about mutations
- [Fragments](/guides/fragments) - Learn more about fragments
- [Subscriptions](/guides/subscriptions) - Learn more about subscriptions
