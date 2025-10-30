---
description: Understand what modern GraphQL clients do, why they exist, and how they solve common challenges in building data-driven applications.
---

# Modern GraphQL

Modern GraphQL clients provide essential infrastructure for building data-driven applications at scale.

## Beyond Basic Fetching

GraphQL lets you describe exactly what data you need. A basic fetch looks simple:

```typescript
const response = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      query {
        user(id: "123") {
          name
          email
        }
      }
    `,
  }),
});

const { data } = await response.json();
```

This works, but real applications need more. What happens when:

- Multiple components request the same data?
- A mutation updates data that's displayed elsewhere?
- Your component unmounts mid-request?
- The network request fails?
- You need to refetch stale data?

Solving these problems requires significant infrastructure. Modern GraphQL clients provide this infrastructure out of the box.

## What GraphQL Clients Solve

### Request Management

GraphQL clients handle the mechanics of sending requests and processing responses:

- Serialization and deserialization
- Request cancellation when components unmount
- Automatic retries on network failures
- Request deduplication to avoid redundant queries

### State Management

Clients maintain query results as application state:

- Loading states during network requests
- Error handling and recovery
- Data availability while revalidating
- Stale data management

### Caching

Clients cache responses to avoid unnecessary network requests:

- Serve immediate results from cache
- Automatically update related queries when data changes
- Invalidate stale data intelligently
- Optimize memory usage

### Type Safety

Modern clients generate TypeScript types from your schema:

- Autocomplete for queries and mutations
- Compile-time validation of field selection
- Type-safe variables and responses
- Refactoring safety across your codebase

## Evolution of GraphQL Clients

Early GraphQL clients were thin wrappers around fetch. They handled the HTTP request but left everything else to you.

**First Generation** clients added basic features like loading states and simple caching. They cached entire queries as separate entries, which meant updating data in one query wouldn't affect others displaying the same information.

**Modern clients** normalize data at the entity level. When a mutation updates a user, every query displaying that user automatically updates. They also generate types, support fragment colocation, and provide extensible middleware.

## The GraphQL Client Stack

A modern GraphQL client provides several layers:

### Transport Layer

Sends operations over the network. Handles HTTP for queries and mutations, WebSocket or SSE for subscriptions.

### Cache Layer

Stores and retrieves data. Normalizes entities by ID so updates propagate automatically. Manages cache invalidation based on your schema structure.

### Middleware Layer

Composable functions that transform requests and responses. Add authentication, logging, retries, or custom behavior without modifying core logic.

### Framework Integration

Bindings for your UI framework. React hooks, Vue composables, Svelte stores, or Solid primitives that automatically trigger re-renders when data changes.

### Type Generation

Build-time code generation that produces TypeScript types from your GraphQL operations. Ensures compile-time safety from schema to UI.

## Why Use a GraphQL Client

A GraphQL client eliminates entire classes of problems:

- **No manual cache management** - Data stays consistent automatically
- **No boilerplate** - Request handling and state management are built-in
- **No runtime errors** - Type generation catches mistakes at compile time
- **No performance issues** - Caching and deduplication prevent redundant requests
- **No fragmentation** - Colocate data requirements with components that use them

These benefits compound as applications grow. What starts as minor conveniences become essential infrastructure for teams working on complex, data-intensive applications.

## Modern Client Features

Features that define modern GraphQL clients:

- **Normalized caching** - Entity-based storage with automatic updates
- **Fragment colocation** - Components declare their own data requirements
- **Type generation** - Compile-time safety from schema to UI
- **Optimistic updates** - Instant UI feedback before server confirmation
- **Suspense integration** - Native support for React Suspense and concurrent features
- **Extensible middleware** - Composable request/response transformations
- **Framework agnostic** - Same patterns across React, Vue, Svelte, Solid
- **Subscriptions** - Real-time updates via WebSocket or SSE
- **Offline support** - Queue mutations and sync when online
- **DevTools** - Inspect cache, network activity, and performance

## Next Steps

- [Type Safety](/concepts/type-safety) - How compile-time validation prevents bugs
- [Caching](/concepts/caching) - How normalized caching keeps data consistent
- [Fragments](/concepts/fragments) - How to colocate data requirements with components
- [Streams](/concepts/streams) - How the middleware architecture works
