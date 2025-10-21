# Mearie

[![npm](https://img.shields.io/npm/v/mearie)](https://www.npmjs.com/package/mearie)
[![License](https://img.shields.io/github/license/devunt/mearie)](https://github.com/devunt/mearie/blob/main/LICENSE)

Mearie is a type-safe GraphQL client with zero runtime overhead. Write queries
as template literals and get automatic type generation at build time. The
library provides normalized caching, fragment colocation, and composable
middleware.

Mearie consists of two parts:

- `mearie` - Build-time codegen and tooling (dev dependency)
- `@mearie/{framework}` - Framework-specific runtime with client and bindings (React, Vue, Svelte, Solid)

Here's a quick example:

```tsx
import { graphql } from '~graphql';
import { createClient, httpLink, cacheLink, ClientProvider, useQuery } from '@mearie/react';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

export function App() {
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
          email
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

Full documentation is available at <https://mearie.dev/>.

## Etymology

The name _Mearie_ (pronounced /meh-ah-ree/) comes from the Korean word
<q>메아리</q>, meaning _echo_.
