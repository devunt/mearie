import { graphql } from '$graphql';
import type { UserProfile$key } from '$graphql';
import { useFragment, useMutation, useQuery } from '@mearie/react';

const getUserQuery = useQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        email
        ...UserProfile
      }
    }
  `),
  { id: '1' },
);

const getPostsQuery = useQuery(
  graphql(`
    query GetPosts {
      posts {
        id
        title
        author {
          name
        }
      }
    }
  `),
);

const [createPost, createPostResult] = useMutation(
  graphql(`
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        id
        title
        content
      }
    }
  `),
);

createPost({ input: { title: 'Hello, world!', content: 'This is a test post.', authorId: '1' } });

const UserProfileFragment = useFragment(
  graphql(`
    fragment UserProfile on User {
      name
    }
  `),
  'a' as unknown as UserProfile$key,
);
