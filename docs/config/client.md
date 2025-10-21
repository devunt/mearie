---
description: Configure the GraphQL client with links for networking, caching, and custom behavior. Learn basic and recommended production configurations.
---

# Client Config

Configure the GraphQL client with links for networking, caching, and custom behavior.

## Basic Configuration

Create a client with at least one terminating link (like `httpLink`):

```typescript
// src/lib/graphql-client.ts
import { createClient, httpLink } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid

export const client = createClient({
  links: [
    httpLink({
      url: 'https://api.example.com/graphql',
    }),
  ],
});
```

## Recommended Configuration

Add caching and deduplication for production use:

```typescript
import { createClient, httpLink, cacheLink, dedupLink } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid

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

## Next Steps

- [Links Guide](/guides/links) - Learn how links work
- [HTTP Link](/links/http) - Configure HTTP transport
- [Cache Link](/links/cache) - Configure caching
- [Custom Links](/links/custom) - Create custom middleware
