# mearie

Core GraphQL client package for Mearie.

This package provides the GraphQL client runtime with support for queries,
mutations, subscriptions, normalized caching, and composable middleware links.

## Installation

```bash
npm install mearie
```

## Usage

```typescript
import { createClient, httpLink, cacheLink, graphql } from 'mearie';

const client = createClient({
  links: [cacheLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});

const result = await client.query(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }
  `),
  { id: '1' },
);
```

For framework-specific usage, see [@mearie/react](https://www.npmjs.com/package/@mearie/react),
[@mearie/vue](https://www.npmjs.com/package/@mearie/vue),
[@mearie/svelte](https://www.npmjs.com/package/@mearie/svelte), or
[@mearie/solid](https://www.npmjs.com/package/@mearie/solid).

## Documentation

Full documentation is available at <https://mearie.dev/>.
