---
description: React hooks for queries, mutations, fragments, and subscriptions with full type safety and React Suspense support. Learn about useQuery, useMutation, useFragment, and useSubscription.
---

# React Integration

Mearie provides React hooks for queries, mutations, fragments, and subscriptions with full type safety and React Suspense support.

## Installation

Install the core package and the React integration:

::: code-group

```sh [npm]
npm install -D mearie
npm install @mearie/react
```

```sh [yarn]
yarn add -D mearie
yarn add @mearie/react
```

```sh [pnpm]
pnpm add -D mearie
pnpm add @mearie/react
```

```sh [bun]
bun add -D mearie
bun add @mearie/react
```

```sh [deno]
deno add --dev npm:mearie
deno add npm:@mearie/react
```

:::

## Setup

### 1. Add Build Plugin

Add Mearie's build plugin to enable automatic type generation from your GraphQL documents:

::: code-group

```typescript [Vite]
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mearie from 'mearie/vite';

export default defineConfig({
  plugins: [react(), mearie()],
});
```

```typescript [Next.js]
// next.config.js
import withMearie from 'mearie/next';

export default withMearie({
  // Your Next.js config
});
```

:::

::: tip
By default, Mearie looks for `./schema.graphql` relative to your `vite.config.ts` or `next.config.js`. For custom schema locations or advanced configuration, see [Codegen Config](/config/codegen).
:::

### 2. Create Client

Create a GraphQL client with your API endpoint. Import `createClient` and links from `@mearie/react`:

```typescript
// src/lib/graphql-client.ts
import { createClient, httpLink, cacheLink, dedupLink } from '@mearie/react';

export const client = createClient({
  links: [
    dedupLink(),
    cacheLink(),
    httpLink({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

See [Links](/guides/links) for more details on available links and middleware.

### 3. Set Up Provider

Wrap your app with the client provider to make the GraphQL client available throughout your component tree:

```tsx
// src/app.tsx
import { ClientProvider } from '@mearie/react';
import { client } from './lib/graphql-client';

<ClientProvider client={client}>
  <App />
</ClientProvider>;
```

## Hooks

### useQuery

Fetch data with automatic caching and updates:

```tsx
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';

export const UserProfile = ({ userId }: { userId: string }) => {
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
    {
      id: userId,
    },
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <img src={data.user.avatar} alt={data.user.name} />
      <h1>{data.user.name}</h1>
      {data.user.bio && <p>{data.user.bio}</p>}
      <p>Email: {data.user.email}</p>
      <p>Age: {data.user.age}</p>
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
};
```

### useMutation

Modify data with automatic cache updates:

```tsx
import { useState } from 'react';
import { graphql } from '~graphql';
import { useMutation } from '@mearie/react';

export const EditUserForm = ({ userId }: { userId: string }) => {
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

### useFragment

Co-locate data requirements with components:

```tsx
import { graphql } from '~graphql';
import { useFragment } from '@mearie/react';
import type { UserCard_user$key } from '~graphql';

export const UserCard = ({ user }: { user: UserCard_user$key }) => {
  const data = useFragment(
    graphql(`
      fragment UserCard_user on User {
        id
        name
        avatar
        email
      }
    `),
    user,
  );

  return (
    <div className="card">
      <img src={data.avatar} alt={data.name} />
      <h3>{data.name}</h3>
      <p>{data.email}</p>
    </div>
  );
};
```

### useSubscription

Real-time updates via subscriptions:

```tsx
import { graphql } from '~graphql';
import { useSubscription } from '@mearie/react';

interface ChatMessagesProps {
  chatId: string;
}

export const ChatMessages = ({ chatId }: ChatMessagesProps) => {
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
    {
      chatId,
    },
  );

  return (
    <div>
      <div>{loading ? 'Connecting...' : 'Connected'}</div>
      {data?.messageAdded && (
        <div>
          <strong>{data.messageAdded.author.name}:</strong>
          {data.messageAdded.body}
        </div>
      )}
    </div>
  );
};
```

## React Suspense

Use with React Suspense for simpler loading states:

```tsx
import { Suspense } from 'react';
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';

const UserProfile = ({ userId }: { userId: string }) => {
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
    { id: userId },
    { suspense: true },
  );

  return <h1>{data.user.name}</h1>;
};

const App = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  );
};
```

## Next Steps

- [Queries](/guides/queries) - Learn more about queries
- [Mutations](/guides/mutations) - Learn more about mutations
- [Fragments](/guides/fragments) - Learn more about fragments
- [Subscriptions](/guides/subscriptions) - Learn more about subscriptions
