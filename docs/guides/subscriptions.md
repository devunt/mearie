---
description: Learn how to handle real-time data updates with GraphQL subscriptions using Server-Sent Events or WebSocket. Combine queries with subscriptions for initial data.
---

# Subscriptions

Learn how to handle real-time data updates with subscriptions.

## Basic Subscription

Subscriptions enable real-time communication between client and server for chat messages, notifications, live dashboards, and more.

Define a subscription like queries and mutations:

```typescript
import { graphql } from '$mearie';
import { useSubscription } from '@mearie/react';

const ChatMessages = ({ chatId }: { chatId: string }) => {
  const { data, error } = useSubscription(
    graphql(`
      subscription MessageAddedSubscription($chatId: ID!) {
        messageAdded(chatId: $chatId) {
          id
          content
          author {
            id
            name
            avatar
          }
          createdAt
        }
      }
    `),
    { chatId },
  );

  return (
    <div>
      {data && <div>New message: {data.messageAdded.content}</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
};
```

::: tip Other Frameworks
See [Vue](/frameworks/vue), [Svelte](/frameworks/svelte), or [Solid](/frameworks/solid) for framework-specific examples.
:::

## Client Setup

Configure your client to support subscriptions.

### Server-Sent Events (SSE)

Simple HTTP-based protocol. Recommended for most use cases.

```typescript
import { createClient, httpExchange, subscriptionExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { createClient as createSSEClient } from 'graphql-sse';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createSSEClient({
        url: 'https://api.example.com/graphql',
      }),
    }),
  ],
});
```

::: tip
Install the `graphql-sse` package to use Server-Sent Events:

```sh
npm install graphql-sse
```

:::

### WebSocket

Alternative protocol with lower latency using GraphQL over WebSocket.

```typescript
import { createClient, httpExchange, subscriptionExchange } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid
import { createClient as createWSClient } from 'graphql-ws';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    httpExchange({ url: 'https://api.example.com/graphql' }),
    subscriptionExchange({
      client: createWSClient({
        url: 'wss://api.example.com/graphql',
      }),
    }),
  ],
});
```

::: tip
Install the `graphql-ws` package to use WebSocket:

```sh
npm install graphql-ws
```

:::

## Latest State Only

Display only the current state (e.g., online status):

```typescript
const UserStatus = ({ userId }: { userId: string }) => {
  const { data, loading, error } = useSubscription(
    graphql(`
      subscription UserStatusSubscription($userId: ID!) {
        userStatus(userId: $userId) {
          online
          lastSeen
          typing
        }
      }
    `),
    { userId },
  );

  if (loading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <span className={data.userStatus.online ? 'online' : 'offline'}>
        {data.userStatus.online ? 'Online' : 'Offline'}
      </span>
      {data.userStatus.typing && <span>typing...</span>}
    </div>
  );
};
```

## Accumulating Events

Collect events over time (e.g., chat messages):

```typescript
import { useState, useCallback } from 'react';
import { useSubscription, type DataOf } from '@mearie/react';
import { graphql } from '$mearie';
import type { MessageAddedSubscription } from '$mearie';

const ChatMessages = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  const handleMessageAdded = useCallback((data: DataOf<MessageAddedSubscription>) => {
    setMessages((prev) => [...prev, data.messageAdded]);
  }, []);

  useSubscription(
    graphql(`
      subscription MessageAddedSubscription($chatId: ID!) {
        messageAdded(chatId: $chatId) {
          id
          content
          author {
            id
            name
          }
          createdAt
        }
      }
    `),
    { chatId },
    {
      onData: handleMessageAdded,
    },
  );

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  );
};
```

## Combining with Queries

Load initial data with a query, then subscribe for updates:

```typescript
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useSubscription, type DataOf } from '@mearie/react';
import { graphql } from '$mearie';
import type { MessageAddedSubscription } from '$mearie';

const ChatRoom = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  // Load initial messages
  const { data, loading } = useQuery(
    graphql(`
      query GetMessagesQuery($chatId: ID!) {
        messages(chatId: $chatId) {
          id
          content
        }
      }
    `),
    { chatId },
  );

  useEffect(() => {
    if (data) {
      setMessages(data.messages);
    }
  }, [data]);

  const handleMessageAdded = useCallback((data: DataOf<MessageAddedSubscription>) => {
    setMessages((prev) => [...prev, data.messageAdded]);
  }, []);

  // Subscribe to new messages
  useSubscription(
    graphql(`
      subscription MessageAddedSubscription($chatId: ID!) {
        messageAdded(chatId: $chatId) {
          id
          content
        }
      }
    `),
    { chatId },
    {
      onData: handleMessageAdded,
    },
  );

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
};
```

## Subscription Options

Control subscription behavior with options:

```typescript
import { useCallback } from 'react';
import { useSubscription, type DataOf } from '@mearie/react';
import { graphql } from '$mearie';
import type { MessageAddedSubscription } from '$mearie';

const handleData = useCallback((data: DataOf<MessageAddedSubscription>) => {
  console.log('New message:', data.messageAdded);
}, []);

const handleError = useCallback((error: Error) => {
  console.error('Subscription error:', error);
}, []);

const { data, error, loading } = useSubscription(
  graphql(`
    subscription MessageAddedSubscription($chatId: ID!) {
      messageAdded(chatId: $chatId) {
        id
        content
      }
    }
  `),
  { chatId },
  {
    // Skip execution conditionally
    skip: !chatId,

    // Process each event
    onData: handleData,

    // Handle errors
    onError: handleError,
  },
);
```

## Best Practices

- Name subscriptions with `Subscription` suffix (e.g., `MessageAddedSubscription`)
- Load initial data with queries first, use subscriptions only for updates
- Handle connection errors gracefully

## Next Steps

- [Subscription Exchange](/exchanges/subscription) - Learn more about subscription configuration
- [Queries](/guides/queries) - Load initial data
- [Exchanges](/guides/exchanges) - Learn about the exchange system
