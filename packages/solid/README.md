# @mearie/solid

Solid bindings for Mearie GraphQL client.

This package provides Solid primitives and components for using Mearie in Solid
applications.

## Installation

```bash
npm install mearie @mearie/solid
```

## Usage

```tsx
import { type Component } from 'solid-js';
import { createClient, httpLink, cacheLink, graphql } from 'mearie';
import { ClientProvider, createQuery } from '@mearie/solid';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

const App: Component = () => {
  return (
    <ClientProvider client={client}>
      <UserProfile userId="1" />
    </ClientProvider>
  );
};

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
