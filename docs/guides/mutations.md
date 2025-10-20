---
description: Learn how to modify data with GraphQL mutations, implement optimistic updates, and handle loading states with automatic cache updates.
---

# Mutations

Learn how to modify data with mutations.

## Basic Mutation

```tsx
import { useState } from 'react';
import { graphql } from 'mearie';
import { useMutation } from '@mearie/react';

export const EditUserForm = ({ userId }: { userId: string }) => {
  const [name, setName] = useState('');
  const [updateUser, { loading }] = useMutation(
    graphql(`
      mutation UpdateUserMutation($id: ID!, $name: String!) {
        updateUser(id: $id, input: { name: $name }) {
          id
          name
        }
      }
    `),
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await updateUser({ id: userId, name });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} required />
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
};
```

::: tip Other Frameworks
See [Vue](/frameworks/vue), [Svelte](/frameworks/svelte), or [Solid](/frameworks/solid) for framework-specific examples.
:::

## Automatic Cache Updates

When mutations return data, Mearie automatically updates the normalized cache and re-renders affected components.

## Optimistic Updates

Update the UI before the server responds:

```typescript
const [likePost] = useMutation(
  graphql(`
    mutation LikePostMutation($postId: ID!) {
      likePost(postId: $postId) {
        id
        liked
        likeCount
      }
    }
  `),
);

const handleLike = async (postId: string) => {
  await likePost(
    { postId },
    {
      optimisticResponse: {
        likePost: {
          id: postId,
          liked: true,
          likeCount: (prev) => prev + 1,
        },
      },
    },
  );
};
```

## Loading States

Handle loading states gracefully:

```typescript
const [updateUser, { loading }] = useMutation(
  graphql(`
    mutation UpdateUserMutation($id: ID!, $name: String!) {
      updateUser(id: $id, input: { name: $name }) {
        id
        name
      }
    }
  `),
);

return (
  <button disabled={loading}>
    {loading ? 'Saving...' : 'Save'}
  </button>
);
```

## Best Practices

- Name mutations with `Mutation` suffix (e.g., `UpdateUserMutation`)
- Show loading states to provide user feedback

## Next Steps

- [Queries](/guides/queries) - Learn how to fetch data
- [Fragments](/guides/fragments) - Co-locate data requirements with components
- [Links](/guides/links) - Customize request/response handling
