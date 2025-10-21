---
description: Learn how to handle real-time data updates with GraphQL subscriptions using Server-Sent Events or WebSocket. Combine queries with subscriptions for initial data.
---

# Subscriptions

Learn how to handle real-time data updates with subscriptions.

## Basic Subscription

Subscriptions enable real-time communication between client and server for chat messages, notifications, live dashboards, and more.

Define a subscription like queries and mutations:

```typescript
import { graphql } from '~graphql';
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
import { createClient, httpLink, sseLink } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid

export const client = createClient({
  links: [
    httpLink({ url: 'https://api.example.com/graphql' }),
    sseLink({ url: 'https://api.example.com/graphql/stream' }),
  ],
});
```

### WebSocket

Alternative protocol with lower latency.

```typescript
import { createClient, httpLink, wsLink } from '@mearie/react'; // or @mearie/vue, @mearie/svelte, @mearie/solid

export const client = createClient({
  links: [httpLink({ url: 'https://api.example.com/graphql' }), wsLink({ url: 'wss://api.example.com/graphql' })],
});
```

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
import { useState } from 'react';

const ChatMessages = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);

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
      onData: (data) => {
        setMessages((prev) => [...prev, data.messageAdded]);
      },
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
      onData: (data) => {
        setMessages((prev) => [...prev, data.messageAdded]);
      },
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
    onData: (data) => {
      console.log('New message:', data.messageAdded);
    },

    // Handle errors
    onError: (error) => {
      console.error('Subscription error:', error);
    },
  },
);
```

## Best Practices

- Name subscriptions with `Subscription` suffix (e.g., `MessageAddedSubscription`)
- Load initial data with queries first, use subscriptions only for updates
- Handle connection errors gracefully

## Next Steps

- [SSE Link](/links/sse) - Set up Server-Sent Events for subscriptions
- [WebSocket Link](/links/ws) - Set up WebSocket for subscriptions
- [Queries](/guides/queries) - Load initial data
