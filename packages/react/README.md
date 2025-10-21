# @mearie/react

React bindings for Mearie GraphQL client.

This package provides React hooks, components, and the GraphQL client runtime
for using Mearie in React applications.

## Installation

```bash
npm install -D mearie
npm install @mearie/react
```

The `mearie` package provides build-time code generation, while `@mearie/react`
includes the runtime client and React-specific hooks.

## Usage

First, create a client and wrap your app with the provider:

```tsx
// src/App.tsx
import { createClient, httpLink, cacheLink, ClientProvider } from '@mearie/react';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

function App() {
  return (
    <ClientProvider client={client}>
      {/* Your app components */}
    </ClientProvider>
  );
}
```

Then use it in your components:

```tsx
// src/components/UserProfile.tsx
import { graphql } from '~graphql';
import { useQuery } from '@mearie/react';

interface UserProfileProps {
  userId: string;
}

function UserProfile({ userId }: UserProfileProps) {
  const { data, loading } = useQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `),
    { id: userId },
  );

  if (loading) return <div>Loading...</div>;
  return <h1>{data.user.name}</h1>;
}
```

## Documentation

Full documentation is available at <https://mearie.dev/frameworks/react>.
