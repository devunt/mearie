import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cache } from './cache.ts';
import type { SchemaMeta } from '../types.ts';
import type { Artifact } from '@mearie/shared';

type UserQueryResult = {
  user: {
    __typename: 'User';
    id: string;
    name: string;
    email: string;
  };
};

type UserWithPostsQueryResult = {
  user: {
    __typename: 'User';
    id: string;
    name: string;
    posts: {
      __typename: 'Post';
      id: string;
      title: string;
    }[];
  };
};

type PostsQueryResult = {
  posts: {
    __typename: 'Post';
    id: string;
    title: string;
    author: {
      __typename: 'User';
      id: string;
      name: string;
    };
  }[];
};

const createTestSchema = (): SchemaMeta => ({
  entities: {
    User: {
      keyFields: ['id'],
    },
    Post: {
      keyFields: ['id'],
    },
    Comment: {
      keyFields: ['id'],
    },
  },
});

const createUserQuery = (): Artifact<'query', 'GetUser', UserQueryResult, { id: string }> => ({
  kind: 'query' as const,
  name: 'GetUser',
  source: 'query GetUser($id: ID!) { user(id: $id) { __typename id name email } }',
  selections: [
    {
      kind: 'Field' as const,
      name: 'user',
      type: 'User',
      array: false,
      args: {
        id: { kind: 'variable', name: 'id' },
      },
      selections: [
        { kind: 'Field' as const, name: '__typename' },
        { kind: 'Field' as const, name: 'id' },
        { kind: 'Field' as const, name: 'name' },
        { kind: 'Field' as const, name: 'email' },
      ],
    },
  ],
});

const createUserWithPostsQuery = (): Artifact<
  'query',
  'GetUserWithPosts',
  UserWithPostsQueryResult,
  { id: string }
> => ({
  kind: 'query' as const,
  name: 'GetUserWithPosts',
  source: 'query GetUserWithPosts($id: ID!) { user(id: $id) { __typename id name posts { __typename id title } } }',
  selections: [
    {
      kind: 'Field' as const,
      name: 'user',
      type: 'User',
      array: false,
      args: {
        id: { kind: 'variable', name: 'id' },
      },
      selections: [
        { kind: 'Field' as const, name: '__typename' },
        { kind: 'Field' as const, name: 'id' },
        { kind: 'Field' as const, name: 'name' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename' },
            { kind: 'Field' as const, name: 'id' },
            { kind: 'Field' as const, name: 'title' },
          ],
        },
      ],
    },
  ],
});

const createPostsQuery = (): Artifact<'query', 'GetPosts', PostsQueryResult, Record<string, never>> => ({
  kind: 'query' as const,
  name: 'GetPosts',
  source: 'query GetPosts { posts { __typename id title author { __typename id name } } }',
  selections: [
    {
      kind: 'Field' as const,
      name: 'posts',
      type: 'Post',
      array: true,
      selections: [
        { kind: 'Field' as const, name: '__typename' },
        { kind: 'Field' as const, name: 'id' },
        { kind: 'Field' as const, name: 'title' },
        {
          kind: 'Field' as const,
          name: 'author',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename' },
            { kind: 'Field' as const, name: 'id' },
            { kind: 'Field' as const, name: 'name' },
          ],
        },
      ],
    },
  ],
});

describe('NormalizedCache', () => {
  let cache: Cache;
  let schema: SchemaMeta;

  beforeEach(() => {
    schema = createTestSchema();
    cache = new Cache(schema);
  });

  describe('writeQuery and readQuery', () => {
    it('should write and read a simple query', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);
      const cached = cache.readQuery(document, variables);

      expect(cached).toEqual(result);
    });

    it('should return null for non-existent query', () => {
      const document = createUserQuery();
      const variables = { id: '1' };

      const cached = cache.readQuery(document, variables);
      expect(cached).toBeNull();
    });

    it('should cache results with different variables separately', () => {
      const document = createUserQuery();
      const result1 = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };
      const result2 = {
        user: {
          __typename: 'User' as const,
          id: '2',
          name: 'Bob',
          email: 'bob@example.com',
        },
      };

      cache.writeQuery(document, { id: '1' }, result1);
      cache.writeQuery(document, { id: '2' }, result2);

      expect(cache.readQuery(document, { id: '1' })).toEqual(result1);
      expect(cache.readQuery(document, { id: '2' })).toEqual(result2);
    });

    it('should normalize entities when writing', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);

      const cached = cache.readQuery(document, variables);
      expect(cached).toEqual(result);
    });
  });

  describe('nested entities', () => {
    it('should handle nested entities', () => {
      const document = createUserWithPostsQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          posts: [
            {
              __typename: 'Post' as const,
              id: '1',
              title: 'First Post',
            },
            {
              __typename: 'Post' as const,
              id: '2',
              title: 'Second Post',
            },
          ],
        },
      };

      cache.writeQuery(document, variables, result);
      const cached = cache.readQuery(document, variables);

      expect(cached).toEqual(result);
    });

    it('should handle deeply nested entities', () => {
      const document = createPostsQuery();
      const variables = {};
      const result = {
        posts: [
          {
            __typename: 'Post' as const,
            id: '1',
            title: 'Post 1',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
          {
            __typename: 'Post' as const,
            id: '2',
            title: 'Post 2',
            author: {
              __typename: 'User' as const,
              id: '2',
              name: 'Bob',
            },
          },
        ],
      };

      cache.writeQuery(document, variables, result);
      const cached = cache.readQuery(document, variables);

      expect(cached).toEqual(result);
    });
  });

  describe('subscribe and unsubscribe', () => {
    it('should call listener when query is rewritten', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);

      const listener = vi.fn();
      cache.subscribe(document, variables, listener);

      const updatedResult = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice Updated',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, updatedResult);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not call listener after unsubscribe', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);

      const listener = vi.fn();
      const unsubscribe = cache.subscribe(document, variables, listener);

      unsubscribe();

      const updatedResult = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice Updated',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, updatedResult);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners for same query', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribe(document, variables, listener1);
      cache.subscribe(document, variables, listener2);

      const updatedResult = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice Updated',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, updatedResult);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('evictQuery', () => {
    it('should remove query from cache', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);
      cache.evictQuery(document, variables);

      const cached = cache.readQuery(document, variables);
      expect(cached).toBeNull();
    });

    it('should notify listeners when query is evicted', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result);

      const listener = vi.fn();
      cache.subscribe(document, variables, listener);

      cache.evictQuery(document, variables);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all cache data', () => {
      const document1 = createUserQuery();
      const document2 = createPostsQuery();

      cache.writeQuery(
        document1,
        { id: '1' },
        {
          user: {
            __typename: 'User' as const,
            id: '1',
            name: 'Alice',
            email: 'alice@example.com',
          },
        },
      );

      cache.writeQuery(
        document2,
        {},
        {
          posts: [
            {
              __typename: 'Post' as const,
              id: '1',
              title: 'Post 1',
              author: {
                __typename: 'User' as const,
                id: '1',
                name: 'Alice',
              },
            },
          ],
        },
      );

      cache.clear();

      expect(cache.readQuery(document1, { id: '1' })).toBeNull();
      expect(cache.readQuery(document2, {})).toBeNull();
    });
  });

  describe('complex scenarios', () => {
    it('should handle shared entities across multiple queries', () => {
      const userQuery = createUserQuery();
      const postsQuery = createPostsQuery();

      const userResult = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const postsResult = {
        posts: [
          {
            __typename: 'Post' as const,
            id: '1',
            title: 'Post 1',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
        ],
      };

      cache.writeQuery(userQuery, { id: '1' }, userResult);
      cache.writeQuery(postsQuery, {}, postsResult);

      const updatedUserResult = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice Updated',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(userQuery, { id: '1' }, updatedUserResult);

      const cachedUser = cache.readQuery(userQuery, { id: '1' });
      const cachedPosts = cache.readQuery(postsQuery, {});

      expect(cachedUser?.user.name).toBe('Alice Updated');
      expect(cachedPosts?.posts[0]?.author.name).toBe('Alice Updated');
    });

    it('should handle array of entities correctly', () => {
      const document = createPostsQuery();
      const variables = {};
      const result = {
        posts: [
          {
            __typename: 'Post' as const,
            id: '1',
            title: 'Post 1',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
          {
            __typename: 'Post' as const,
            id: '2',
            title: 'Post 2',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
        ],
      };

      cache.writeQuery(document, variables, result);

      const updatedResult = {
        posts: [
          {
            __typename: 'Post' as const,
            id: '1',
            title: 'Updated Post 1',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
          {
            __typename: 'Post' as const,
            id: '2',
            title: 'Post 2',
            author: {
              __typename: 'User' as const,
              id: '1',
              name: 'Alice',
            },
          },
        ],
      };

      cache.writeQuery(document, variables, updatedResult);

      const cached = cache.readQuery(document, variables);
      expect(cached?.posts[0]?.title).toBe('Updated Post 1');
      expect(cached?.posts[1]?.title).toBe('Post 2');
    });
  });

  describe('dependency tracking edge cases', () => {
    it('should notify listener each time query is rewritten', () => {
      const document = createUserQuery();
      const variables = { id: '1' };
      const result1 = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      cache.writeQuery(document, variables, result1);

      const listener = vi.fn();
      cache.subscribe(document, variables, listener);

      const result2 = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'Alice Updated',
          email: 'alice.updated@example.com',
        },
      };

      cache.writeQuery(document, variables, result2);

      expect(listener).toHaveBeenCalledTimes(1);

      const result3 = {
        user: {
          __typename: 'User' as const,
          id: '1',
          name: 'New Name',
          email: 'alice.updated@example.com',
        },
      };

      cache.writeQuery(document, variables, result3);

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
