import { graphql } from 'mearie';
import { useQuery } from '@mearie/react';

const getUserQuery = useQuery(
  graphql(`
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `),
  { id: '1' },
);

const getPostsQuery = graphql(`
  query GetPosts {
    posts {
      id
      title
      author {
        name
      }
    }
  }
`);

const createPostMutation = graphql(`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      title
      content
    }
  }
`);

const UserProfileFragment = graphql(`
  fragment UserProfile on User {
    name
  }
`);

console.log('GraphQL operations defined:', {
  getUserQuery,
  getPostsQuery,
  createPostMutation,
});
