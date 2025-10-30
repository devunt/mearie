---
description: A zero-config GraphQL client with zero boilerplate, complete type safety, and zero runtime overhead. Learn why Mearie is different and see quick examples.
---

# Why Mearie?

Mearie (메아리, meaning "echo" in Korean) is a full-featured, framework-agnostic GraphQL client for building scalable applications.

::: warning Early Development
Mearie is in its very early stage and under very active development. Things may not work as expected or described in the documentation. Please expect frequent breaking changes.
:::

## Motivation

Building scalable data-driven applications requires more than basic query execution. Certain architectural patterns have proven essential: fragment colocation places data requirements directly where they're consumed, preventing coupling and over-fetching. Normalized caching maintains consistency automatically as data changes throughout your application. Code generation establishes type safety from your GraphQL schema all the way to your UI components. When combined, these patterns eliminate entire classes of bugs and maintenance overhead.

Relay pioneered this integrated approach and remains the most mature implementation. However, its rigid architectural requirements and steep learning curve create friction for many teams. This complexity has prevented these patterns from reaching broader adoption, keeping their benefits inaccessible to most developers.

Mearie makes these patterns accessible through a more pragmatic design. It reduces complexity with sensible defaults and minimal configuration, while remaining extensible for advanced use cases. As a full-featured, framework-agnostic GraphQL client, it prioritizes approachability without compromising capability. Features can be adopted incrementally as your needs evolve. By lowering barriers to entry, Mearie brings these architectural patterns to the broader GraphQL community.

## Quick Example

::: code-group

<!-- prettier-ignore-start -->

```tsx twoslash mearie [React]
import { graphql } from '$mearie';
import { useQuery } from '@mearie/react';

export const UserProfile = ({ userId }: { userId: string }) => {
  const { data, loading, error } = useQuery(
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
  if (error) return <div>Error: {error.message}</div>;

  return (
    <h1>
      {data.user.name}
      //    ^?
    </h1>
  );
};
```
<!-- prettier-ignore-end -->

```vue [Vue]
<script setup lang="ts">
import { graphql } from '$mearie';
import { useQuery } from '@mearie/vue';

const props = defineProps<{ userId: string }>();

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
  () => ({ id: props.userId }),
);
</script>

<template>
  <div v-if="loading">Loading...</div>
  <h1 v-else>{{ data.user.name }}</h1>
</template>
```

```svelte [Svelte]
<script lang="ts">
import { graphql } from '$mearie';
import { createQuery } from '@mearie/svelte';

interface Props {
  userId: string;
}

let { userId }: Props = $props();

const query = createQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  () => ({ id: userId }),
);
</script>

{#if query.loading}
  <div>Loading...</div>
{:else}
  <h1>{query.data.user.name}</h1>
{/if}
```

```tsx [Solid]
import { type Component } from 'solid-js';
import { graphql } from '$mearie';
import { createQuery } from '@mearie/solid';

interface UserProfileProps {
  userId: string;
}

export const UserProfile: Component<UserProfileProps> = (props) => {
  const query = createQuery(
    graphql(`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
        }
      }
    `),
    () => ({ id: props.userId }),
  );

  if (query.loading) return <div>Loading...</div>;
  return <h1>{query.data.user.name}</h1>;
};
```

:::

## Features

- **End-to-end type safety** - Generated types flow from your GraphQL schema through to UI components, catching errors at compile time
- **Ahead-of-time compilation** - Operations are parsed and optimized during build, eliminating runtime parsing overhead
- **Fragment colocation** - Data requirements live alongside the components that use them, reducing coupling and preventing over-fetching
- **Normalized caching** - Data stays consistent across your application as changes propagate automatically through the cache
- **Framework-agnostic** - Works seamlessly with React, Vue, Svelte, Solid, and vanilla JavaScript through dedicated integrations
- **Extensible architecture** - Composable exchange system enables auth, retries, logging, and custom request handling through a flexible stream-based architecture
- **Minimal configuration** - Start quickly with sensible defaults, scale to complex setups as requirements grow

## When to Use Mearie

Mearie is built for applications where data complexity and maintainability matter. Consider Mearie if you:

- **Need robust type safety** - Compile-time validation catches type mismatches before deployment, with complete schema-to-component type inference
- **Work across multiple frameworks** - Use the same GraphQL patterns across different projects, whether they're built with React, Vue, Svelte, or Solid
- **Want better maintainability** - Colocated data requirements and automatic cache synchronization prevent common bugs as your app grows
- **Build complex applications** - Proven architectural patterns provide structure that handles growing data complexity without refactoring
- **Prefer incremental adoption** - Begin with basic queries and progressively enable advanced features without disrupting existing code

Mearie might not be the right choice if you:

- Need a production-proven solution immediately (Mearie is in early development)
- Require extensive ecosystem plugins and integrations (the ecosystem is still growing)
- Work with simple, mostly-static data that doesn't benefit from normalized caching

## FAQ

### Do I need a Relay-compliant GraphQL server?

For basic functionality, any GraphQL server works. Advanced features like fragment refetching require Relay server specifications (global object identification, Node interface). You can adopt these incrementally as needed.

### How does Mearie compare to Relay?

Mearie implements similar architectural patterns (fragment colocation, normalized caching, code generation) with greater framework flexibility and less opinionated architecture. Relay remains more mature and battle-tested at scale.

### How does Mearie compare to Apollo?

Apollo offers a mature ecosystem with extensive plugins. Mearie focuses on compile-time type safety, framework-agnostic design, and enforcing patterns like fragment colocation that Apollo leaves optional.

### What's the learning curve?

If you know GraphQL basics, you can start immediately. Advanced patterns like normalized cache directives and exchanges require deeper understanding. The approach is more opinionated than Apollo but more flexible than Relay.

### Is Mearie production-ready?

No. Mearie is in early development with frequent breaking changes expected. Use it for side projects and experimentation, but not for production applications yet.

### What frameworks are supported?

React, Vue, Svelte, Solid, and vanilla JavaScript through dedicated integrations. Each integration provides idiomatic APIs for that framework.

## Next Steps

- [Installation](/getting-started/installation) - Install Mearie
- [Setup](/getting-started/setup) - Configure your project
- [Your First Query](/getting-started/your-first-query) - Write your first query
