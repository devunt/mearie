# @mearie/solid

Solid bindings for Mearie GraphQL client.

This package provides Solid primitives, components, and the GraphQL client
runtime for using Mearie in Solid applications.

## Installation

```bash
npm install -D mearie
npm install @mearie/solid
```

The `mearie` package provides build-time code generation, while `@mearie/solid`
includes the runtime client and Solid-specific primitives.

## Usage

First, create a client and wrap your app with the provider:

```tsx
// src/App.tsx
import { type Component } from 'solid-js';
import { createClient, httpExchange, cacheExchange, dedupExchange, ClientProvider } from '@mearie/solid';
import { schema } from '$mearie';

const client = createClient({
  schema,
  exchanges: [dedupExchange(), cacheExchange(), httpExchange({ url: 'https://api.example.com/graphql' })],
});

const App: Component = () => {
  return <ClientProvider client={client}>{/* Your app components */}</ClientProvider>;
};
```

Then use it in your components:

```tsx
// src/components/UserProfile.tsx
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
import { createQuery } from '@mearie/solid';

interface UserProfileProps {
  userId: string;
}

const UserProfile: Component<UserProfileProps> = (props) => {
  const query = createQuery(
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

  if (query.loading) return <div>Loading...</div>;
  return <h1>{query.data.user.name}</h1>;
};
```

## Documentation

Full documentation is available at <https://mearie.dev/frameworks/solid>.
