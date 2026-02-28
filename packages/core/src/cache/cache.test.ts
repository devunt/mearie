import { describe, it, expect, vi } from 'vitest';
import { Cache } from './cache.ts';
import type { Artifact, FragmentRefs, SchemaMeta } from '@mearie/shared';
import { FragmentRefKey } from './constants.ts';

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
    Comment: { keyFields: ['postId', 'id'] },
    Profile: { keyFields: ['_id'] },
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

      const result = cache.readQuery(artifact, {}).data;

      expect(result).toEqual({ name: 'Alice' });
    });

    it('should write multiple scalar fields to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUser', [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'age', type: 'Int' },
      ]);

      cache.writeQuery(artifact, {}, { name: 'Alice', age: 30 });

      const result = cache.readQuery(artifact, {}).data;

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should write null value to cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: null });

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact2, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, { limit: 5 }).data;

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

      const result = cache.readQuery(artifact, {}).data;
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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact2, {}).data;

      expect(result).toBeNull();
    });

    it('should read scalar field from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const result = cache.readQuery(artifact, {}).data;

      expect(result).toEqual({ name: 'Alice' });
    });

    it('should read null value from cache', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: null });

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact2, {}).data;

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

      const result = cache.readQuery(artifact, { limit: 5 }).data;

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

      const result = cache.readFragment(artifact, {} as FragmentRefs<string>).data;

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

      const result = cache.readFragment(artifact, fragmentRef).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);

      const result = cache.readFragment(fragmentArtifact, fragmentRef).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'email', type: 'String' },
      ]);

      const result = cache.readFragment(fragmentArtifact, fragmentRef).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
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

      const queryResult = cache.readQuery(queryArtifact1, {}).data as { user: FragmentRefs<string> };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(result.stale).toBe(true);
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

      cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

      const result = cache.readQuery(artifact, {});

      expect(result.data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
      });
      expect(result.stale).toBe(true);
    });

    it('should invalidate all root queries', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });

      cache.invalidate({ __typename: 'Query' });

      const result = cache.readQuery(artifact, {});

      expect(result.data).toEqual({ name: 'Alice' });
      expect(result.stale).toBe(true);
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

      cache.invalidate({ __typename: 'Query', $field: 'posts', $args: { limit: 10 } });

      const postsResult = cache.readQuery(artifact1, {});
      const nameResult = cache.readQuery(artifact2, {});

      expect(postsResult.data).toEqual({ posts: ['post1', 'post2'] });
      expect(postsResult.stale).toBe(true);
      expect(nameResult.data).toEqual({ name: 'Alice' });
      expect(nameResult.stale).toBe(false);
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

      expect(result.stale).toBe(true);
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

      cache.invalidate({ __typename: 'User', $field: 'email' });

      const result = cache.readQuery(artifact, {});

      expect(result.stale).toBe(true);
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

    it('should notify query subscriptions that depend on entity links', () => {
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

      const listener = vi.fn();
      cache.subscribeQuery(queryArtifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should only notify fragment-only query subscriptions that overlap the invalidated field', () => {
      const cache = new Cache(schema);

      const nameFragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];
      const emailFragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const nameQueryArtifact = createArtifact('query', 'GetUserName', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [{ kind: 'FragmentSpread', name: 'UserNameFragment', selections: nameFragmentSelections }],
        },
      ]);

      const emailQueryArtifact = createArtifact('query', 'GetUserEmail', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [{ kind: 'FragmentSpread', name: 'UserEmailFragment', selections: emailFragmentSelections }],
        },
      ]);

      cache.writeQuery(
        createArtifact('query', 'GetUser', [
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
        ]),
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        },
      );

      const nameListener = vi.fn();
      const emailListener = vi.fn();

      cache.subscribeQuery(nameQueryArtifact, {}, nameListener);
      cache.subscribeQuery(emailQueryArtifact, {}, emailListener);

      cache.invalidate({ __typename: 'User', id: '1', $field: 'name' });

      expect(nameListener).toHaveBeenCalledTimes(1);
      expect(emailListener).not.toHaveBeenCalled();
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

      cache.invalidate({ __typename: 'User', id: '1' }, { __typename: 'Query', $field: 'name' });

      const userResult = cache.readQuery(userArtifact, {});
      const nameResult = cache.readQuery(nameArtifact, {});

      expect(userResult.stale).toBe(true);
      expect(nameResult.stale).toBe(true);
    });

    it('should not throw when invalidating nonexistent entity', () => {
      const cache = new Cache(schema);

      expect(() => {
        cache.invalidate({ __typename: 'User', id: '999' });
      }).not.toThrow();

      expect(() => {
        cache.invalidate({ __typename: 'User', id: '999', $field: 'name' });
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

      cache.invalidate({ __typename: 'Comment', postId: '1', id: '1' });

      const result = cache.readQuery(artifact, {});

      expect(result.stale).toBe(true);
    });

    it('should invalidate entity with non-id key field (_id)', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetProfile', [
        {
          kind: 'Field',
          name: 'profile',
          type: 'Profile',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: '_id', type: 'ID' },
            { kind: 'Field', name: 'bio', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { profile: { __typename: 'Profile', _id: 'p1', bio: 'Hello' } });

      cache.invalidate({ __typename: 'Profile', _id: 'p1' });

      const result = cache.readQuery(artifact, {});

      expect(result.data).toEqual({ profile: { __typename: 'Profile', _id: 'p1', bio: 'Hello' } });
      expect(result.stale).toBe(true);
    });

    it('should invalidate specific field on entity with non-id key field', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetProfile', [
        {
          kind: 'Field',
          name: 'profile',
          type: 'Profile',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: '_id', type: 'ID' },
            { kind: 'Field', name: 'bio', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { profile: { __typename: 'Profile', _id: 'p1', bio: 'Hello' } });

      cache.invalidate({ __typename: 'Profile', _id: 'p1', $field: 'bio' });

      const result = cache.readQuery(artifact, {});

      expect(result.data).toEqual({ profile: { __typename: 'Profile', _id: 'p1', bio: 'Hello' } });
      expect(result.stale).toBe(true);
    });

    it('should invalidate composite key entity with $field', () => {
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

      cache.writeQuery(artifact, {}, { comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great!' } });

      cache.invalidate({ __typename: 'Comment', postId: '1', id: '1', $field: 'text' });

      const result = cache.readQuery(artifact, {});

      expect(result.data).toEqual({ comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great!' } });
      expect(result.stale).toBe(true);
    });

    it('should invalidate root query with $field and $args', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'users',
          type: 'User',
          array: true,
          args: {
            limit: { kind: 'literal', value: 5 },
            offset: { kind: 'literal', value: 0 },
          },
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(artifact, {}, { users: [{ __typename: 'User', id: '1', name: 'Alice' }] });

      cache.invalidate({ __typename: 'Query', $field: 'users', $args: { limit: 5, offset: 0 } });

      const result = cache.readQuery(artifact, {});

      expect(result.stale).toBe(true);
    });

    it('should fall back to typename-wide invalidation when key fields are missing', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'GetProfiles', [
        {
          kind: 'Field',
          name: 'profiles',
          type: 'Profile',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: '_id', type: 'ID' },
            { kind: 'Field', name: 'bio', type: 'String' },
          ],
        },
      ]);

      cache.writeQuery(
        artifact,
        {},
        {
          profiles: [
            { __typename: 'Profile', _id: 'p1', bio: 'Hello' },
            { __typename: 'Profile', _id: 'p2', bio: 'World' },
          ],
        },
      );

      cache.invalidate({ __typename: 'Profile' });

      const result = cache.readQuery(artifact, {});

      expect(result.stale).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty query selections', () => {
      const cache = new Cache(schema);

      const artifact = createArtifact('query', 'EmptyQuery', []);

      cache.writeQuery(artifact, {}, {});

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readQuery(artifact, {}).data;

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

      const result = cache.readFragments(artifact, []).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
      const fragmentRefs = queryResult.users;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      const result = cache.readFragments(fragmentArtifact, fragmentRefs).data;

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

      const validRef = (cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> }).user;
      const missingRef = { [FragmentRefKey]: 'User:999' } as unknown as FragmentRefs<string>;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      const result = cache.readFragments(fragmentArtifact, [validRef, missingRef]).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
      const fragmentRefs = queryResult.users;

      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'email', type: 'String' },
      ]);
      const result = cache.readFragments(fragmentArtifact, fragmentRefs).data;

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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { users: FragmentRefs<string>[] };
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

  describe('structural sharing', () => {
    describe('readQuery', () => {
      it('should return same reference when reading identical data', () => {
        const cache = new Cache(schema);

        const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

        cache.writeQuery(artifact, {}, { name: 'Alice' });

        const result1 = cache.readQuery(artifact, {}).data;
        const result2 = cache.readQuery(artifact, {}).data;

        expect(result1).toBe(result2);
      });

      it('should return new reference when data actually changed', () => {
        const cache = new Cache(schema);

        const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

        cache.writeQuery(artifact, {}, { name: 'Alice' });
        const result1 = cache.readQuery(artifact, {}).data;

        cache.writeQuery(artifact, {}, { name: 'Bob' });
        const result2 = cache.readQuery(artifact, {}).data;

        expect(result1).not.toBe(result2);
        expect(result2).toEqual({ name: 'Bob' });
      });

      it('should preserve unchanged entity subtree references', () => {
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

        const result1 = cache.readQuery(artifact, {}).data as { users: { id: string; name: string }[] };

        // Write same data again (simulating a re-fetch with no changes)
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

        const result2 = cache.readQuery(artifact, {}).data as { users: { id: string; name: string }[] };

        expect(result1).toBe(result2);
        expect(result1.users).toBe(result2.users);
        expect(result1.users[0]).toBe(result2.users[0]);
        expect(result1.users[1]).toBe(result2.users[1]);
      });

      it('should preserve unchanged entities when only one entity changes', () => {
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

        const result1 = cache.readQuery(artifact, {}).data as { users: { id: string; name: string }[] };

        // Only change user 2's name
        cache.writeQuery(
          artifact,
          {},
          {
            users: [
              { __typename: 'User', id: '1', name: 'Alice' },
              { __typename: 'User', id: '2', name: 'Bobby' },
            ],
          },
        );

        const result2 = cache.readQuery(artifact, {}).data as { users: { id: string; name: string }[] };

        expect(result2).not.toBe(result1);
        expect(result2.users).not.toBe(result1.users);
        expect(result2.users[0]).toBe(result1.users[0]); // Alice unchanged
        expect(result2.users[1]).not.toBe(result1.users[1]); // Bob changed
        expect(result2.users[1]!.name).toBe('Bobby');
      });

      it('should preserve references across different queries sharing entities', () => {
        const cache = new Cache(schema);

        const queryA = createArtifact('query', 'GetUser', [
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

        const queryB = createArtifact('query', 'GetPost', [
          {
            kind: 'Field',
            name: 'post',
            type: 'Post',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'title', type: 'String' },
            ],
          },
        ]);

        // Write query A
        cache.writeQuery(queryA, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
        const resultA1 = cache.readQuery(queryA, {}).data;

        // Write unrelated query B - should not affect query A's reference
        cache.writeQuery(queryB, {}, { post: { __typename: 'Post', id: 'p1', title: 'Hello' } });
        const resultA2 = cache.readQuery(queryA, {}).data;

        expect(resultA1).toBe(resultA2);
      });

      it('should handle variables in structural sharing key', () => {
        const cache = new Cache(schema);

        const artifact = createArtifact('query', 'GetUser', [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            args: { id: { kind: 'variable', name: 'id' } },
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
            ],
          },
        ]);

        cache.writeQuery(artifact, { id: '1' }, { user: { __typename: 'User', id: '1', name: 'Alice' } });
        cache.writeQuery(artifact, { id: '2' }, { user: { __typename: 'User', id: '2', name: 'Bob' } });

        const result1a = cache.readQuery(artifact, { id: '1' }).data;
        const result2a = cache.readQuery(artifact, { id: '2' }).data;

        // Re-read without changes
        const result1b = cache.readQuery(artifact, { id: '1' }).data;
        const result2b = cache.readQuery(artifact, { id: '2' }).data;

        expect(result1a).toBe(result1b);
        expect(result2a).toBe(result2b);
        expect(result1a).not.toBe(result2a); // different variables = different results
      });

      it('should produce stable references after hydration from snapshot', () => {
        // Simulate SSR: server writes and reads, then extracts snapshot
        const serverCache = new Cache(schema);
        const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

        serverCache.writeQuery(artifact, {}, { name: 'Alice' });
        serverCache.readQuery(artifact, {}); // populates previousResults on server
        const snapshot = serverCache.extract();

        // Simulate client: hydrate from snapshot, then read repeatedly
        const clientCache = new Cache(schema);
        clientCache.hydrate(snapshot);

        const result1 = clientCache.readQuery(artifact, {}).data;
        const result2 = clientCache.readQuery(artifact, {}).data;

        expect(result1).toBe(result2);
        expect(result1).toEqual({ name: 'Alice' });
      });
    });

    describe('readFragment', () => {
      it('should return same reference when reading identical fragment data', () => {
        const cache = new Cache(schema);

        const queryArtifact = createArtifact('query', 'GetUser', [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
              { kind: 'FragmentSpread', name: 'UserFragment', selections: [] },
            ],
          },
        ]);

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ]);

        cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        const ref = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<'UserFragment'>;

        const result1 = cache.readFragment(fragmentArtifact, ref).data;
        const result2 = cache.readFragment(fragmentArtifact, ref).data;

        expect(result1).toBe(result2);
      });

      it('should return new reference when fragment entity data changed', () => {
        const cache = new Cache(schema);

        const queryArtifact = createArtifact('query', 'GetUser', [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
              { kind: 'FragmentSpread', name: 'UserFragment', selections: [] },
            ],
          },
        ]);

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ]);

        cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
        const ref = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<'UserFragment'>;
        const result1 = cache.readFragment(fragmentArtifact, ref).data;

        cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alicia' } });
        const result2 = cache.readFragment(fragmentArtifact, ref).data;

        expect(result1).not.toBe(result2);
        expect(result2).toEqual({ __typename: 'User', id: '1', name: 'Alicia' });
      });
    });

    describe('readFragments', () => {
      it('should return same array reference when reading identical fragment array', () => {
        const cache = new Cache(schema);

        const queryArtifact = createArtifact('query', 'GetUsers', [
          {
            kind: 'Field',
            name: 'users',
            type: 'User',
            array: true,
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
              { kind: 'FragmentSpread', name: 'UserFragment', selections: [] },
            ],
          },
        ]);

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
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

        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<'UserFragment'>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<'UserFragment'>,
        ];

        const result1 = cache.readFragments(fragmentArtifact, refs).data;
        const result2 = cache.readFragments(fragmentArtifact, refs).data;

        expect(result1).toBe(result2);
      });

      it('should preserve unchanged elements when one fragment changes', () => {
        const cache = new Cache(schema);

        const queryArtifact = createArtifact('query', 'GetUsers', [
          {
            kind: 'Field',
            name: 'users',
            type: 'User',
            array: true,
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
              { kind: 'FragmentSpread', name: 'UserFragment', selections: [] },
            ],
          },
        ]);

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
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

        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<'UserFragment'>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<'UserFragment'>,
        ];

        const result1 = cache.readFragments(fragmentArtifact, refs).data!;

        // Change only user 2
        cache.writeQuery(
          queryArtifact,
          {},
          {
            users: [
              { __typename: 'User', id: '1', name: 'Alice' },
              { __typename: 'User', id: '2', name: 'Bobby' },
            ],
          },
        );

        const result2 = cache.readFragments(fragmentArtifact, refs).data!;

        expect(result2).not.toBe(result1);
        expect(result2[0]).toBe(result1[0]); // Alice unchanged
        expect(result2[1]).not.toBe(result1[1]); // Bob changed
      });
    });

    describe('clear', () => {
      it('should reset structural sharing state on clear', () => {
        const cache = new Cache(schema);

        const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

        cache.writeQuery(artifact, {}, { name: 'Alice' });
        const result1 = cache.readQuery(artifact, {}).data;

        cache.clear();

        cache.writeQuery(artifact, {}, { name: 'Alice' });
        const result2 = cache.readQuery(artifact, {}).data;

        // After clear, even with same data, reference should be new
        // because the previous result map was cleared
        expect(result1).not.toBe(result2);
        expect(result1).toEqual(result2);
      });
    });
  });

  describe('stale', () => {
    describe('readQuery', () => {
      it('should return stale: false for fresh data', () => {
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

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      });

      it('should return stale: true after entity invalidation', () => {
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

        expect(result.stale).toBe(true);
        expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      });

      it('should return stale: true after field invalidation', () => {
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

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(true);
        expect(result.data).toEqual({
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        });
      });

      it('should return stale: true after root query invalidation', () => {
        const cache = new Cache(schema);

        const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

        cache.writeQuery(artifact, {}, { name: 'Alice' });

        cache.invalidate({ __typename: 'Query' });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(true);
        expect(result.data).toEqual({ name: 'Alice' });
      });

      it('should return data: null and stale: false for partial + stale', () => {
        const cache = new Cache(schema);

        const writeArtifact = createArtifact('query', 'GetUserName', [
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

        const readArtifact = createArtifact('query', 'GetUserFull', [
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

        cache.writeQuery(writeArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        cache.invalidate({ __typename: 'User', id: '1' });

        const result = cache.readQuery(readArtifact, {});

        expect(result.data).toBeNull();
        expect(result.stale).toBe(false);
      });

      it('should not leak stale to unrelated query on same entity (field-level)', () => {
        const cache = new Cache(schema);

        const nameArtifact = createArtifact('query', 'GetUserName', [
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

        const emailArtifact = createArtifact('query', 'GetUserEmail', [
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

        cache.writeQuery(nameArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
        cache.writeQuery(emailArtifact, {}, { user: { __typename: 'User', id: '1', email: 'alice@example.com' } });

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        const nameResult = cache.readQuery(nameArtifact, {});
        const emailResult = cache.readQuery(emailArtifact, {});

        expect(nameResult.stale).toBe(false);
        expect(emailResult.stale).toBe(true);
      });
    });

    describe('readFragment', () => {
      it('should return stale: false for fresh fragment', () => {
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

        const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

        const result = cache.readFragment(fragmentArtifact, fragmentRef);

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });
      });

      it('should return stale: true after entity invalidation', () => {
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

        cache.invalidate({ __typename: 'User', id: '1' });

        const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

        const result = cache.readFragment(fragmentArtifact, fragmentRef);

        expect(result.stale).toBe(true);
        expect(result.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });
      });

      it('should return stale: true after field invalidation of included field', () => {
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
              { kind: 'Field', name: 'email', type: 'String' },
            ],
          },
        ]);

        cache.writeQuery(
          queryArtifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

        const result = cache.readFragment(fragmentArtifact, fragmentRef);

        expect(result.stale).toBe(true);
      });

      it('should return stale: false after field invalidation of non-included field', () => {
        const cache = new Cache(schema);

        const queryArtifact = createArtifact('query', 'GetUser', [
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
          queryArtifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
        const fragmentArtifact = createArtifact('fragment', 'NameFragment', [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ]);

        const result = cache.readFragment(fragmentArtifact, fragmentRef);

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });
      });
    });

    describe('readFragments', () => {
      it('should return stale: false when all fragments are fresh', () => {
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

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<string>,
        ];

        const result = cache.readFragments(fragmentArtifact, refs);

        expect(result.stale).toBe(false);
        expect(result.data).toEqual([
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ]);
      });

      it('should return stale: true when one fragment is stale', () => {
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

        cache.invalidate({ __typename: 'User', id: '1' });

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<string>,
        ];

        const result = cache.readFragments(fragmentArtifact, refs);

        expect(result.stale).toBe(true);
        expect(result.data).toEqual([
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ]);
      });

      it('should return stale: true when all fragments are stale', () => {
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

        cache.invalidate({ __typename: 'User', id: '1' });
        cache.invalidate({ __typename: 'User', id: '2' });

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<string>,
        ];

        const result = cache.readFragments(fragmentArtifact, refs);

        expect(result.stale).toBe(true);
        expect(result.data).toEqual([
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ]);
      });
    });

    describe('writeQuery clears stale', () => {
      it('should clear entity-level stale on writeQuery', () => {
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

        expect(cache.readQuery(artifact, {}).stale).toBe(true);

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      });

      it('should clear field-level stale on writeQuery', () => {
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

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        expect(cache.readQuery(artifact, {}).stale).toBe(true);

        cache.writeQuery(
          artifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(false);
      });

      it('should notify subscriber when only entity-level stale clears (identical data)', () => {
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
        listener.mockClear();

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(cache.readQuery(artifact, {}).stale).toBe(false);
      });

      it('should notify subscriber when only field-level stale clears (identical data)', () => {
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

        const listener = vi.fn();
        cache.subscribeQuery(artifact, {}, listener);

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        expect(listener).toHaveBeenCalledTimes(1);
        listener.mockClear();

        cache.writeQuery(
          artifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(cache.readQuery(artifact, {}).stale).toBe(false);
      });

      it('should not notify subscriber when writing identical data with no stale', () => {
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

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe('stale interactions', () => {
      it('should handle double invalidation', () => {
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
        expect(cache.readQuery(artifact, {}).stale).toBe(true);

        cache.invalidate({ __typename: 'User', id: '1' });

        expect(listener).toHaveBeenCalledTimes(2);
        expect(cache.readQuery(artifact, {}).stale).toBe(true);
      });

      it('should return stale: false after invalidate then clear then fresh write', () => {
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

        cache.clear();

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      });

      it('should return stale: false when pre-invalidating nonexistent entity then writing it', () => {
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

        cache.invalidate({ __typename: 'User', id: '999' });

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '999', name: 'Ghost' } });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(false);
        expect(result.data).toEqual({ user: { __typename: 'User', id: '999', name: 'Ghost' } });
      });

      it('should reset stale after clear', () => {
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

        expect(cache.readQuery(artifact, {}).stale).toBe(true);

        cache.clear();

        cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        const result = cache.readQuery(artifact, {});

        expect(result.stale).toBe(false);
      });

      it('should not clear stale for unwritten fields on partial write', () => {
        const cache = new Cache(schema);

        const fullArtifact = createArtifact('query', 'GetUserFull', [
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

        const nameOnlyArtifact = createArtifact('query', 'GetUserName', [
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

        cache.writeQuery(
          fullArtifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        expect(cache.readQuery(fullArtifact, {}).stale).toBe(true);

        cache.writeQuery(nameOnlyArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

        const result = cache.readQuery(fullArtifact, {});

        expect(result.stale).toBe(true);
      });
    });

    describe('subscriptions', () => {
      it('should notify subscribeFragment on entity invalidation', () => {
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

        const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

        const listener = vi.fn();
        cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

        cache.invalidate({ __typename: 'User', id: '1' });

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('should notify subscribeFragments on entity invalidation', () => {
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

        const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
        const refs = [
          { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>,
          { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<string>,
        ];

        const listener = vi.fn();
        cache.subscribeFragments(fragmentArtifact, refs, listener);

        cache.invalidate({ __typename: 'User', id: '1' });

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it('should notify subscribeQuery with fragment-spread-only on field-level invalidation', () => {
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
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ]);

        cache.writeQuery(
          queryArtifact,
          {},
          { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
        );

        const listener = vi.fn();
        cache.subscribeQuery(queryArtifact, {}, listener);

        cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });
  });
});
