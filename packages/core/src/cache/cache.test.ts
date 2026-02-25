import { describe, it, expect, vi } from 'vitest';
import { Cache } from './cache.ts';
import type { Artifact, FragmentRefs, SchemaMeta } from '@mearie/shared';
import { FragmentRefKey } from './constants.ts';

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
    Comment: { keyFields: ['postId', 'id'] },
  },
  inputs: {},
  scalars: {},
};

const createArtifact = <K extends 'query' | 'fragment'>(
  kind: K,
  name: string,
  selections: Artifact['selections'],
): Artifact<K> => ({
  kind,
  name,
  body: '',
  selections,
});

describe('Cache', () => {
  describe('constructor', () => {
    it('should create cache instance with schema metadata', () => {
      const cache = new Cache(schema);
      expect(cache).toBeInstanceOf(Cache);
    });
  });

  describe('writeQuery', () => {
    it('should write scalar field to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: 'Alice' });
    });

    it('should write multiple scalar fields to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'age', type: 'Int' },
      ]);

      cache.writeQuery(artifact, {}, { name: 'Alice', age: 30 });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should write null value to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: null });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: null });
    });

    it('should normalize entity to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
    });

    it('should merge fields into existing entity', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetUserName', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const artifact2 = createArtifact('query', 'GetUserEmail', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'email', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(artifact2, {}, { user: { __typename: 'User', id: '1', email: 'alice@example.com' } });

      const result = cache.readQuery(artifact2, {});

      expect(result).toEqual({ user: { __typename: 'User', id: '1', email: 'alice@example.com' } });
    });

    it('should write array of entities to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      });
    });

    it('should handle field with arguments', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal', value: 10 },
          },
        },
      ]);

      cache.writeQuery(artifact, {}, { posts: ['post1', 'post2'] });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ posts: ['post1', 'post2'] });
    });

    it('should resolve variable arguments', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable', name: 'limit' },
          },
        },
      ]);

      cache.writeQuery(artifact, { limit: 5 }, { posts: ['post1', 'post2'] });

      const result = cache.readQuery(artifact, { limit: 5 });

      expect(result).toEqual({ posts: ['post1', 'post2'] });
    });

    it('should trigger subscriptions when writing to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should trigger multiple subscriptions when writing to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribeQuery(artifact, {}, listener1);
      cache.subscribeQuery(artifact, {}, listener2);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should trigger entity field subscriptions when normalizing entity', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should trigger subscriptions when entity array order changes', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      // Write with reversed order
      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '2', name: 'Bob' },
            { __typename: 'User', id: '1', name: 'Alice' },
          ],
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);

      const result = cache.readQuery(artifact, {});
      expect(result).toEqual({
        users: [
          { __typename: 'User', id: '2', name: 'Bob' },
          { __typename: 'User', id: '1', name: 'Alice' },
        ],
      });
    });
  });

  describe('readQuery', () => {
    it('should return null when query not in cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should return null when entity not in cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should return null when partial data exists', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetUserName', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const artifact2 = createArtifact('query', 'GetUserEmail', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'email', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const result = cache.readQuery(artifact2, {});

      expect(result).toBeNull();
    });

    it('should read scalar field from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: 'Alice' });
    });

    it('should read null value from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: null });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: null });
    });

    it('should denormalize entity from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
    });

    it('should denormalize array of entities from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      });
    });

    it('should respect field arguments when reading', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal', value: 10 },
          },
        },
      ]);

      const artifact2 = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal', value: 5 },
          },
        },
      ]);

      cache.writeQuery(artifact1, {}, { posts: ['post1', 'post2'] });

      const result = cache.readQuery(artifact2, {});

      expect(result).toBeNull();
    });

    it('should resolve variable arguments when reading', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable', name: 'limit' },
          },
        },
      ]);

      cache.writeQuery(artifact, { limit: 5 }, { posts: ['post1', 'post2'] });

      const result = cache.readQuery(artifact, { limit: 5 });

      expect(result).toEqual({ posts: ['post1', 'post2'] });
    });
  });

  describe('subscribeQuery', () => {
    it('should return unsubscribe function', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const unsubscribe = cache.subscribeQuery(artifact, {}, vi.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call listener when subscribed field is updated', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not call listener after unsubscribe', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener = vi.fn();
      const unsubscribe = cache.subscribeQuery(artifact, {}, listener);

      unsubscribe();

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should call listener only once per write even with multiple fields', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'age', type: 'Int' },
      ]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Alice', age: 30 });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not call listener when different field is updated', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const artifact2 = createArtifact('query', 'GetAge', [{ kind: 'Field', name: 'age', type: 'Int' }]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact1, {}, listener);

      cache.writeQuery(artifact2, {}, { age: 30 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should call listener when entity field is updated', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const listener = vi.fn();

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple subscriptions to same query', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribeQuery(artifact, {}, listener1);
      cache.subscribeQuery(artifact, {}, listener2);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should cleanup subscription when unsubscribed', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = cache.subscribeQuery(artifact, {}, listener1);
      cache.subscribeQuery(artifact, {}, listener2);

      unsubscribe1();

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should NOT notify when fragment field changes but query only has FragmentSpread', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        },
      );

      const listener = vi.fn();
      cache.subscribeQuery(queryArtifact, {}, listener);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Bob', email: 'alice@example.com' },
        },
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify when fragment field changes and query explicitly requests overlapping field', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        },
      );

      const listener = vi.fn();
      cache.subscribeQuery(queryArtifact, {}, listener);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Bob', email: 'alice@example.com' },
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('readFragment', () => {
    it('should return null for invalid fragment reference', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);

      const result = cache.readFragment(artifact, {} as FragmentRefs<string>);

      expect(result).toBeNull();
    });

    it('should return null when entity not in cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);

      const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;

      const result = cache.readFragment(artifact, fragmentRef);

      expect(result).toBeNull();
    });

    it('should read fragment from cache', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);

      const result = cache.readFragment(fragmentArtifact, fragmentRef);

      expect(result).toEqual({ __typename: 'User', id: '1', name: 'Alice' });
    });

    it('should return null when fragment data is partial', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'email', type: 'String' },
      ]);

      const result = cache.readFragment(fragmentArtifact, fragmentRef);

      expect(result).toBeNull();
    });
  });

  describe('subscribeFragment', () => {
    it('should return unsubscribe function', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const unsubscribe = cache.subscribeFragment(fragmentArtifact, fragmentRef, vi.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call listener when fragment field is updated', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not call listener after unsubscribe', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      const unsubscribe = cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      unsubscribe();

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not call listener when different entity is updated', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact1 = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      const queryArtifact2 = createArtifact('query', 'GetOtherUser', [
        {
          kind: 'Field',
          name: 'otherUser',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(queryArtifact2, {}, { otherUser: { __typename: 'User', id: '2', name: 'Bob' } });

      const queryResult = cache.readQuery(queryArtifact1, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      cache.writeQuery(queryArtifact2, {}, { otherUser: { __typename: 'User', id: '2', name: 'Charlie' } });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple subscriptions to same fragment', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: fragmentSelections,
            },
          ],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribeFragment(fragmentArtifact, fragmentRef, listener1);
      cache.subscribeFragment(fragmentArtifact, fragmentRef, listener2);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear all cache data', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      cache.clear();

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should clear all entity data', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      cache.clear();

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should clear all subscriptions', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      expect(listener).toHaveBeenCalledTimes(1);

      cache.clear();

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should allow writing to cache after clear', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      cache.clear();

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({ name: 'Bob' });
    });
  });

  describe('invalidate', () => {
    it('should invalidate entity by ID', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      cache.invalidate({ __typename: 'User', id: '1' });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should invalidate entity field', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
            { kind: 'Field', name: 'email', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
      );

      cache.invalidate({ __typename: 'User', id: '1', field: 'email' });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should invalidate all root queries', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      cache.invalidate({ __typename: 'Query' });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should invalidate specific root query field', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal', value: 10 },
          },
        },
      ]);

      const artifact2 = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact1, {}, { posts: ['post1', 'post2'] });
      cache.writeQuery(artifact2, {}, { name: 'Alice' });

      cache.invalidate({ __typename: 'Query', field: 'posts', args: { limit: 10 } });

      const postsResult = cache.readQuery(artifact1, {});
      const nameResult = cache.readQuery(artifact2, {});

      expect(postsResult).toBeNull();
      expect(nameResult).toEqual({ name: 'Alice' });
    });

    it('should invalidate all entities of typename', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      cache.invalidate({ __typename: 'User' });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should invalidate field across all entities of typename', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
            { kind: 'Field', name: 'email', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
            { __typename: 'User', id: '2', name: 'Bob', email: 'bob@example.com' },
          ],
        },
      );

      cache.invalidate({ __typename: 'User', field: 'email' });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });

    it('should notify subscriptions on invalidation', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple targets at once', () => {
      const cache = new Cache(schema);

      const userArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const nameArtifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(userArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(nameArtifact, {}, { name: 'Root' });

      cache.invalidate({ __typename: 'User', id: '1' }, { __typename: 'Query', field: 'name' });

      const userResult = cache.readQuery(userArtifact, {});
      const nameResult = cache.readQuery(nameArtifact, {});

      expect(userResult).toBeNull();
      expect(nameResult).toBeNull();
    });

    it('should not throw when invalidating nonexistent entity', () => {
      const cache = new Cache(schema);

      expect(() => {
        cache.invalidate({ __typename: 'User', id: '999' });
      }).not.toThrow();

      expect(() => {
        cache.invalidate({ __typename: 'User', id: '999', field: 'name' });
      }).not.toThrow();

      expect(() => {
        cache.invalidate({ __typename: 'NonExistent' });
      }).not.toThrow();
    });

    it('should invalidate entity with composite key', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetComment', [
        {
          kind: 'Field',
          name: 'comment',
          type: 'Comment',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'postId', type: 'ID' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'text', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great post!' } });

      cache.invalidate({ __typename: 'Comment', id: { postId: '1', id: '1' } });

      const result = cache.readQuery(artifact, {});

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty query selections', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'EmptyQuery', []);

      cache.writeQuery(artifact, {}, {});

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({});
    });

    it('should handle nested entities', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetPost', [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'author',
              type: 'User',
              selections: [
                { kind: 'Field', name: '__typename', type: 'String' },
                { kind: 'Field', name: 'id', type: 'ID' },
                { kind: 'Field', name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          post: {
            __typename: 'Post',
            id: '1',
            author: { __typename: 'User', id: '1', name: 'Alice' },
          },
        },
      );

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          author: { __typename: 'User', id: '1', name: 'Alice' },
        },
      });
    });

    it('should handle same entity referenced in multiple queries', () => {
      const cache = new Cache(schema);

      const artifact1 = createArtifact('query', 'GetUser1', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      const artifact2 = createArtifact('query', 'GetUser2', [
        {
          kind: 'Field',
          name: 'currentUser',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'email', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(artifact2, {}, { currentUser: { __typename: 'User', id: '1', email: 'alice@example.com' } });

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribeQuery(artifact1, {}, listener1);
      cache.subscribeQuery(artifact2, {}, listener2);

      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(0);
    });

    it('should handle entity with composite key', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetComment', [
        {
          kind: 'Field',
          name: 'comment',
          type: 'Comment',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'postId', type: 'ID' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'text', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great post!' },
        },
      );

      const result = cache.readQuery(artifact, {});

      expect(result).toEqual({
        comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great post!' },
      });
    });
  });

  describe('readFragments', () => {
    it('should return empty array for empty fragmentRefs', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);

      const result = cache.readFragments(artifact, []);

      expect(result).toEqual([]);
    });

    it('should read all fragments from cache', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentRefs = queryResult.users;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      const result = cache.readFragments(fragmentArtifact, fragmentRefs);

      expect(result).toEqual([
        { __typename: 'User', id: '1', name: 'Alice' },
        { __typename: 'User', id: '2', name: 'Bob' },
      ]);
    });

    it('should return null if any fragment ref is not in cache', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const validRef = (cache.readQuery(queryArtifact, {}) as { user: FragmentRefs<string> }).user;
      const missingRef = { [FragmentRefKey]: 'User:999' } as unknown as FragmentRefs<string>;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      const result = cache.readFragments(fragmentArtifact, [validRef, missingRef]);

      expect(result).toBeNull();
    });

    it('should return null if any fragment data is partial', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentRefs = queryResult.users;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'email', type: 'String' },
      ]);
      const result = cache.readFragments(fragmentArtifact, fragmentRefs);

      expect(result).toBeNull();
    });
  });

  describe('subscribeFragments', () => {
    it('should return unsubscribe function', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const unsubscribe = cache.subscribeFragments(fragmentArtifact, queryResult.users, vi.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call listener when any fragment field is updated', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      cache.subscribeFragments(fragmentArtifact, queryResult.users, listener);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice Updated' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should call listener when second fragment field is updated', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      cache.subscribeFragments(fragmentArtifact, queryResult.users, listener);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob Updated' },
          ],
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not call listener after unsubscribe', () => {
      const cache = new Cache(schema);

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {}) as { users: FragmentRefs<string>[] };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      const unsubscribe = cache.subscribeFragments(fragmentArtifact, queryResult.users, listener);

      unsubscribe();

      cache.writeQuery(
        queryArtifact,
        {},
        {
          users: [
            { __typename: 'User', id: '1', name: 'Alice Updated' },
            { __typename: 'User', id: '2', name: 'Bob Updated' },
          ],
        },
      );

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
