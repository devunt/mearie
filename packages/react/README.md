# @mearie/react

React bindings for Mearie GraphQL client.

This package provides React hooks and components for using Mearie in React
applications.

## Installation

```bash
npm install mearie @mearie/react
```

## Usage

```tsx
import { createClient, httpLink, cacheLink, graphql } from 'mearie';
import { ClientProvider, useQuery } from '@mearie/react';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

function App() {
  return (
    <ClientProvider client={client}>
      <UserProfile userId="1" />
    </ClientProvider>
  );
}

function UserProfile({ userId }: { userId: string }) {
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
