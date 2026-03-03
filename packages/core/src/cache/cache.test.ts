import { describe, it, expect, vi } from 'vitest';
import { Cache } from './cache.ts';
import type { Artifact, FragmentRefs, SchemaMeta } from '@mearie/shared';
import { FragmentRefKey, FragmentVarsKey } from './constants.ts';
import type { Patch } from './types.ts';

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

const createArtifact = <K extends 'query' | 'mutation' | 'fragment'>(
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

  describe('readQuery', () => {
    it('should return null when query not in cache', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      const result = cache.readQuery(artifact, {});
      expect(result.data).toBeNull();
    });

    it('should read scalar field from cache', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      const result = cache.readQuery(artifact, {}).data;
      expect(result).toEqual({ name: 'Alice' });
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
      expect(cache.readQuery(artifact, {}).data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
    });

    it('should denormalize array of entities', () => {
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
      expect(cache.readQuery(artifact, {}).data).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      });
    });

    it('should return null for partial data', () => {
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
      expect(cache.readQuery(artifact2, {}).data).toBeNull();
    });

    it('should detect stale data', () => {
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

    it('should return stale: false for empty cache', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      const result = cache.readQuery(artifact, {});
      expect(result.data).toBeNull();
      expect(result.stale).toBe(false);
    });

    it('should handle field arguments', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: { limit: { kind: 'literal', value: 10 } },
        },
      ]);
      cache.writeQuery(artifact, {}, { posts: ['post1', 'post2'] });
      expect(cache.readQuery(artifact, {}).data).toEqual({ posts: ['post1', 'post2'] });
    });

    it('should handle variable arguments', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: { limit: { kind: 'variable', name: 'limit' } },
        },
      ]);
      cache.writeQuery(artifact, { limit: 5 }, { posts: ['post1', 'post2'] });
      expect(cache.readQuery(artifact, { limit: 5 }).data).toEqual({ posts: ['post1', 'post2'] });
    });

    it('should read null value', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: null });
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: null });
    });
  });

  describe('writeQuery', () => {
    it('should write scalar field and read it back', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: 'Alice' });
    });

    it('should write multiple scalar fields to cache', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetUser', [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'age', type: 'Int' },
      ]);
      cache.writeQuery(artifact, {}, { name: 'Alice', age: 30 });
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: 'Alice', age: 30 });
    });

    it('should write entity and normalize', () => {
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
      expect(cache.readQuery(artifact, {}).data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
    });

    it('should update existing entity', () => {
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
      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });
      expect(cache.readQuery(artifact, {}).data).toEqual({ user: { __typename: 'User', id: '1', name: 'Bob' } });
    });

    it('should write array of entities', () => {
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
      expect(cache.readQuery(artifact, {}).data).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      });
    });

    it('should handle field arguments', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: { limit: { kind: 'literal', value: 10 } },
        },
      ]);
      cache.writeQuery(artifact, {}, { posts: ['post1', 'post2'] });
      expect(cache.readQuery(artifact, {}).data).toEqual({ posts: ['post1', 'post2'] });
    });

    it('should write null value', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: null });
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: null });
    });

    it('should not call listener when same value is rewritten', () => {
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

    it('should write nested entity and scalar', () => {
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
      expect(cache.readQuery(artifact, {}).data).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          author: { __typename: 'User', id: '1', name: 'Alice' },
        },
      });
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
      expect(cache.readQuery(artifact2, {}).data).toEqual({
        user: { __typename: 'User', id: '1', email: 'alice@example.com' },
      });
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
      expect(cache.readQuery(artifact, {}).data).toEqual({
        users: [
          { __typename: 'User', id: '2', name: 'Bob' },
          { __typename: 'User', id: '1', name: 'Alice' },
        ],
      });
    });
  });

  describe('subscribeQuery initial', () => {
    it('should return correct data on cache hit', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      const result = cache.subscribeQuery(artifact, {}, vi.fn());
      expect(result.data).toEqual({ name: 'Alice' });
      expect(result.stale).toBe(false);
      result.unsubscribe();
    });

    it('should return stale: true when data is stale', () => {
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
      const result = cache.subscribeQuery(artifact, {}, vi.fn());
      expect(result.stale).toBe(true);
      expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      result.unsubscribe();
    });

    it('should return data: null on cache miss', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      const result = cache.subscribeQuery(artifact, {}, vi.fn());
      expect(result.data).toBeNull();
      result.unsubscribe();
    });

    it('should return unsubscribe function and subscription', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      const result = cache.subscribeQuery(artifact, {}, vi.fn());
      expect(typeof result.unsubscribe).toBe('function');
      expect(result.subscription).toBeDefined();
      expect(result.subscription.entryTree).toBeDefined();
      result.unsubscribe();
    });
  });

  describe('subscribeQuery patches', () => {
    it('should emit set patch for scalar change', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toEqual([{ type: 'set', path: ['name'], value: 'Bob' }]);

      unsubscribe();
    });

    it('should emit multiple set patches for multiple scalar changes', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetUser', [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'age', type: 'Int' },
      ]);
      cache.writeQuery(artifact, {}, { name: 'Alice', age: 30 });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { name: 'Bob', age: 25 });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBe(2);
      expect(patches).toContainEqual({ type: 'set', path: ['name'], value: 'Bob' });
      expect(patches).toContainEqual({ type: 'set', path: ['age'], value: 25 });

      unsubscribe();
    });

    it('should emit patches for entity scalar field change', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });

      unsubscribe();
    });

    it('should emit set null when entity ref becomes null', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: null });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toContainEqual({ type: 'set', path: ['user'], value: null });

      unsubscribe();
    });

    it('should emit set denormalized when null becomes entity ref', () => {
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
      cache.writeQuery(artifact, {}, { user: null });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBeGreaterThan(0);
      const setPatch = patches.find(
        (p): p is Extract<Patch, { type: 'set' }> =>
          p.type === 'set' && JSON.stringify(p.path) === JSON.stringify(['user']),
      );
      expect(setPatch).toBeDefined();
      expect(setPatch!.value).toEqual({ __typename: 'User', id: '1', name: 'Alice' });

      unsubscribe();
    });

    it('should emit splice for list add', () => {
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
          users: [{ __typename: 'User', id: '1', name: 'Alice' }],
        },
      );

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

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

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      const splicePatch = patches.find((p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice');
      expect(splicePatch).toBeDefined();
      expect(splicePatch!.deleteCount).toBe(0);
      expect(splicePatch!.items.length).toBe(1);

      unsubscribe();
    });

    it('should emit splice for list delete', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(
        artifact,
        {},
        {
          users: [{ __typename: 'User', id: '1', name: 'Alice' }],
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      const splicePatch = patches.find((p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice');
      expect(splicePatch).toBeDefined();
      expect(splicePatch!.deleteCount).toBe(1);
      expect(splicePatch!.items.length).toBe(0);

      unsubscribe();
    });

    it('should emit swap for list reorder', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

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
      const patches = listener.mock.calls[0]![0] as Patch[];
      const swapPatch = patches.find((p): p is Extract<Patch, { type: 'swap' }> => p.type === 'swap');
      expect(swapPatch).toBeDefined();

      unsubscribe();
    });

    it('should not call listener when data is unchanged', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('should call listener(null) when stale is cleared but data is unchanged', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);
      listener.mockClear();

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);

      unsubscribe();
    });

    it('should emit patches when entity fields change via another query', () => {
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
      const updateArtifact = createArtifact('mutation', 'UpdateUser', [
        {
          kind: 'Field',
          name: 'updateUser',
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(updateArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });

      unsubscribe();
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
      const { unsubscribe: unsub1 } = cache.subscribeQuery(artifact, {}, listener1);
      cache.subscribeQuery(artifact, {}, listener2);
      unsub1();
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
            { kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections },
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
      const { unsubscribe } = cache.subscribeQuery(queryArtifact, {}, listener);
      cache.writeQuery(
        queryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Bob', email: 'alice@example.com' },
        },
      );
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  describe('subscribeQuery unsubscribe', () => {
    it('should not call listener after unsubscribe', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      unsubscribe();

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should still notify other subscribers after partial unsubscribe', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const sub1 = cache.subscribeQuery(artifact, {}, listener1);
      const sub2 = cache.subscribeQuery(artifact, {}, listener2);

      sub1.unsubscribe();

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);

      sub2.unsubscribe();
    });
  });

  describe('subscribeQuery multiple', () => {
    it('should emit independent patches to same query subscribers', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const sub1 = cache.subscribeQuery(artifact, {}, listener1);
      const sub2 = cache.subscribeQuery(artifact, {}, listener2);

      cache.writeQuery(artifact, {}, { name: 'Bob' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('should only emit patches to relevant query subscribers', () => {
      const cache = new Cache(schema);
      const artifact1 = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      const artifact2 = createArtifact('query', 'GetAge', [{ kind: 'Field', name: 'age', type: 'Int' }]);

      cache.writeQuery(artifact1, {}, { name: 'Alice' });
      cache.writeQuery(artifact2, {}, { age: 30 });

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const sub1 = cache.subscribeQuery(artifact1, {}, listener1);
      const sub2 = cache.subscribeQuery(artifact2, {}, listener2);

      cache.writeQuery(artifact2, {}, { age: 25 });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('should handle same entity referenced in multiple queries independently', () => {
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
      const sub1 = cache.subscribeQuery(artifact1, {}, listener1);
      const sub2 = cache.subscribeQuery(artifact2, {}, listener2);

      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();

      sub1.unsubscribe();
      sub2.unsubscribe();
    });
  });

  describe('subscribeFragment', () => {
    it('should emit patches for field change', () => {
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

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentRef = queryResult.user;
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toContainEqual({ type: 'set', path: ['name'], value: 'Bob' });

      unsubscribe();
    });

    it('should not call listener for different entity', () => {
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
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);
      const queryArtifact2 = createArtifact('query', 'GetOtherUser', [
        {
          kind: 'Field',
          name: 'otherUser',
          type: 'User',
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);

      cache.writeQuery(queryArtifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(queryArtifact2, {}, { otherUser: { __typename: 'User', id: '2', name: 'Bob' } });

      const queryResult = cache.readQuery(queryArtifact1, {}).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeFragment(fragmentArtifact, queryResult.user, listener);

      cache.writeQuery(queryArtifact2, {}, { otherUser: { __typename: 'User', id: '2', name: 'Charlie' } });

      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
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
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeFragment(fragmentArtifact, queryResult.user, listener);

      unsubscribe();

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not emit patches when fragment data is partial', () => {
      const cache = new Cache(schema);

      const basicQueryArtifact = createArtifact('query', 'GetUser', [
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
      cache.writeQuery(basicQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;

      const listener = vi.fn();
      const { data, unsubscribe } = cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      expect(data).toBeNull();

      const fullQueryArtifact = createArtifact('query', 'GetUserFull', [
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
        fullQueryArtifact,
        {},
        {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        },
      );

      const patchCalls = listener.mock.calls.filter((call) => call[0] !== null);
      expect(patchCalls).toHaveLength(0);

      unsubscribe();
    });

    it('should handle entity not in cache', () => {
      const cache = new Cache(schema);
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);
      const fragmentRef = { [FragmentRefKey]: 'User:999' } as unknown as FragmentRefs<string>;

      const result = cache.subscribeFragment(fragmentArtifact, fragmentRef, vi.fn());
      expect(result.data).toBeNull();
      expect(result.stale).toBe(false);
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
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const { unsubscribe: unsub1 } = cache.subscribeFragment(fragmentArtifact, queryResult.user, listener1);
      const { unsubscribe: unsub2 } = cache.subscribeFragment(fragmentArtifact, queryResult.user, listener2);

      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });

    it('should resolve variable-dependent fields in entity fragment without fragment arguments', () => {
      const cache = new Cache(schema);
      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'PostConnection',
          args: { count: { kind: 'variable' as const, name: 'count' } },
        },
      ];
      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [{ kind: 'FragmentSpread', name: 'UserPosts', selections: fragmentSelections }],
        },
      ]);
      cache.writeQuery(
        queryArtifact,
        { count: 5 },
        { user: { __typename: 'User', id: '1', posts: ['post1', 'post2'] } },
      );

      const queryResult = cache.readQuery(queryArtifact, { count: 5 }).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserPosts', fragmentSelections);

      const listener = vi.fn();
      const { data, unsubscribe } = cache.subscribeFragment(fragmentArtifact, queryResult.user, listener);

      expect(data).not.toBeNull();
      expect((data as Record<string, unknown>).posts).toEqual(['post1', 'post2']);

      unsubscribe();
    });

    it('should resolve variable-dependent fields in root fragment without fragment arguments', () => {
      const entitySchema: SchemaMeta = { entities: { Entity: { keyFields: ['id'] } }, inputs: {}, scalars: {} };
      const cache = new Cache(entitySchema);
      const fragmentSelections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'Entity',
          args: { slug: { kind: 'variable' as const, name: 'slug' } },
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];
      const queryArtifact = createArtifact('query', 'GetPage', [
        { kind: 'FragmentSpread', name: 'PageFragment', selections: fragmentSelections },
      ]);
      cache.writeQuery(
        queryArtifact,
        { slug: 'hello' },
        { entity: { __typename: 'Entity', id: '1', title: 'Hello World' } },
      );

      const queryResult = cache.readQuery(queryArtifact, { slug: 'hello' }).data as FragmentRefs<string>;
      const fragmentArtifact = createArtifact('fragment', 'PageFragment', fragmentSelections);

      const listener = vi.fn();
      const { data, unsubscribe } = cache.subscribeFragment(fragmentArtifact, queryResult, listener);

      expect(data).not.toBeNull();
      expect((data as Record<string, unknown>).entity).toEqual({
        __typename: 'Entity',
        id: '1',
        title: 'Hello World',
      });

      unsubscribe();
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
      expect(cache.readFragment(artifact, {} as FragmentRefs<string>).data).toBeNull();
    });

    it('should return null when entity not in cache', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);
      const fragmentRef = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
      expect(cache.readFragment(artifact, fragmentRef).data).toBeNull();
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
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);
      cache.writeQuery(
        queryArtifact,
        {},
        { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
      );

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'name', type: 'String' },
      ]);
      expect(cache.readFragment(fragmentArtifact, queryResult.user).data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
      });
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
          selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {}).data as { user: FragmentRefs<string> };
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', [
        { kind: 'Field', name: '__typename', type: 'String' },
        { kind: 'Field', name: 'id', type: 'ID' },
        { kind: 'Field', name: 'email', type: 'String' },
      ]);
      expect(cache.readFragment(fragmentArtifact, queryResult.user).data).toBeNull();
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
      expect(cache.readFragments(artifact, []).data).toEqual([]);
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
      const fragmentArtifact = createArtifact('fragment', 'UserFragment', fragmentSelections);
      expect(cache.readFragments(fragmentArtifact, queryResult.users).data).toEqual([
        { __typename: 'User', id: '1', name: 'Alice' },
        { __typename: 'User', id: '2', name: 'Bob' },
      ]);
    });

    it('should return null if any fragment ref is missing', () => {
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
      expect(cache.readFragments(fragmentArtifact, [validRef, missingRef]).data).toBeNull();
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
      unsubscribe();
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
      const unsubscribe = cache.subscribeFragments(fragmentArtifact, queryResult.users, listener);

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

      expect(listener).toHaveBeenCalled();
      unsubscribe();
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
      const unsubscribe = cache.subscribeFragments(fragmentArtifact, queryResult.users, listener);

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

      expect(listener).toHaveBeenCalled();
      unsubscribe();
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

  describe('invalidate', () => {
    it('should invalidate entity and call listener(null)', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);

      unsubscribe();
    });

    it('should invalidate entity field and call listener(null)', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1', $field: 'email' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);
      expect(cache.readQuery(artifact, {}).stale).toBe(true);

      unsubscribe();
    });

    it('should invalidate all entities by typename', () => {
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
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });

    it('should invalidate root query', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      cache.invalidate({ __typename: 'Query' });
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });

    it('should invalidate specific root query field', () => {
      const cache = new Cache(schema);
      const artifact1 = createArtifact('query', 'GetPosts', [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          args: { limit: { kind: 'literal', value: 10 } },
        },
      ]);
      const artifact2 = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact1, {}, { posts: ['post1', 'post2'] });
      cache.writeQuery(artifact2, {}, { name: 'Alice' });

      cache.invalidate({ __typename: 'Query', $field: 'posts', $args: { limit: 10 } });

      expect(cache.readQuery(artifact1, {}).stale).toBe(true);
      expect(cache.readQuery(artifact2, {}).stale).toBe(false);
    });

    it('should not throw when invalidating nonexistent entity', () => {
      const cache = new Cache(schema);
      expect(() => cache.invalidate({ __typename: 'User', id: '999' })).not.toThrow();
      expect(() => cache.invalidate({ __typename: 'NonExistent' })).not.toThrow();
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
      cache.writeQuery(artifact, {}, { comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great!' } });
      cache.invalidate({ __typename: 'Comment', postId: '1', id: '1' });
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });

    it('should handle multiple targets', () => {
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

      expect(cache.readQuery(userArtifact, {}).stale).toBe(true);
      expect(cache.readQuery(nameArtifact, {}).stale).toBe(true);
    });

    it('should handle entity with _id key field', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetProfile', [
        {
          kind: 'Field',
          name: 'profile',
          type: 'Profile',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: '_id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);
      cache.writeQuery(artifact, {}, { profile: { __typename: 'Profile', _id: 'p1', name: 'Alice' } });
      cache.invalidate({ __typename: 'Profile', _id: 'p1' });
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });

    it('should invalidate typename-wide and affect all entities of that type', () => {
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
          name: 'user',
          type: 'User',
          args: { id: { kind: 'literal', value: '2' } },
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);
      cache.writeQuery(artifact1, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeQuery(artifact2, {}, { user: { __typename: 'User', id: '2', name: 'Bob' } });

      cache.invalidate({ __typename: 'User' });

      expect(cache.readQuery(artifact1, {}).stale).toBe(true);
      expect(cache.readQuery(artifact2, {}).stale).toBe(true);
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
      const unsubscribe = cache.subscribeFragments(fragmentArtifact, refs, listener);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
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
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
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
          args: { limit: { kind: 'literal', value: 5 }, offset: { kind: 'literal', value: 0 } },
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ]);
      cache.writeQuery(artifact, {}, { users: [{ __typename: 'User', id: '1', name: 'Alice' }] });
      cache.invalidate({ __typename: 'Query', $field: 'users', $args: { limit: 5, offset: 0 } });
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
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
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });
  });

  describe('isStale', () => {
    it('should return true when field is stale', () => {
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
      const { subscription, unsubscribe } = cache.subscribeQuery(artifact, {}, vi.fn());

      cache.invalidate({ __typename: 'User', id: '1', $field: 'name' });
      expect(cache.isStale(subscription)).toBe(true);

      unsubscribe();
    });

    it('should return true when entity is stale', () => {
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
      const { subscription, unsubscribe } = cache.subscribeQuery(artifact, {}, vi.fn());

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(cache.isStale(subscription)).toBe(true);

      unsubscribe();
    });

    it('should return false when no stale', () => {
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
      const { subscription, unsubscribe } = cache.subscribeQuery(artifact, {}, vi.fn());

      expect(cache.isStale(subscription)).toBe(false);

      unsubscribe();
    });

    it('should return false after stale is cleared', () => {
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
      const { subscription, unsubscribe } = cache.subscribeQuery(artifact, {}, vi.fn());

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(cache.isStale(subscription)).toBe(true);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(cache.isStale(subscription)).toBe(false);

      unsubscribe();
    });
  });

  describe('writeOptimistic / removeOptimistic', () => {
    const userQueryArtifact = createArtifact('query', 'GetUser', [
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

    const mutationArtifact = createArtifact('mutation', 'UpdateUser', [
      {
        kind: 'Field',
        name: 'updateUser',
        type: 'User',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ]);

    it('should write optimistic data to a separate layer', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });
      expect(cache.readQuery(userQueryArtifact, {}).data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Bob' },
      });
    });

    it('should restore base data after removeOptimistic', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });
      cache.removeOptimistic('op-1');
      expect(cache.readQuery(userQueryArtifact, {}).data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Alice' },
      });
    });

    it('should emit patches on writeOptimistic', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(userQueryArtifact, {}, listener);

      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBeGreaterThan(0);

      const result = cache.readQuery(userQueryArtifact, {});
      expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Bob' } });

      unsubscribe();
    });

    it('should not affect base storage', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });

      const snapshot = cache.extract();
      const baseStorage = (snapshot as unknown as { storage: Record<string, Record<string, unknown>> }).storage;
      expect(baseStorage['User:1']?.['name@{}']).toBe('Alice');
    });

    it('should emit restoration patches on removeOptimistic', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(userQueryArtifact, {}, listener);

      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });
      listener.mockClear();

      cache.removeOptimistic('op-1');

      expect(listener).toHaveBeenCalledTimes(1);
      const result = cache.readQuery(userQueryArtifact, {});
      expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      unsubscribe();
    });

    it('should merge multiple optimistic layers', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });
      cache.writeOptimistic(
        'op-2',
        mutationArtifact,
        {},
        { updateUser: { __typename: 'User', id: '1', name: 'Charlie' } },
      );

      expect(cache.readQuery(userQueryArtifact, {}).data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Charlie' },
      });
    });

    it('should keep remaining layers when one is removed', () => {
      const cache = new Cache(schema);
      cache.writeQuery(userQueryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      cache.writeOptimistic('op-1', mutationArtifact, {}, { updateUser: { __typename: 'User', id: '1', name: 'Bob' } });
      cache.writeOptimistic(
        'op-2',
        mutationArtifact,
        {},
        { updateUser: { __typename: 'User', id: '1', name: 'Charlie' } },
      );

      cache.removeOptimistic('op-2');

      expect(cache.readQuery(userQueryArtifact, {}).data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Bob' },
      });
    });

    it('should handle removeOptimistic for non-existent key', () => {
      const cache = new Cache(schema);
      expect(() => cache.removeOptimistic('non-existent')).not.toThrow();
    });
  });

  describe('extract / hydrate', () => {
    it('should extract storage only', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });

      const snapshot = cache.extract();
      const raw = snapshot as unknown as { storage: Record<string, Record<string, unknown>> };
      expect(raw.storage).toBeDefined();
      expect((snapshot as unknown as Record<string, unknown>).memo).toBeUndefined();
    });

    it('should hydrate and read correctly', () => {
      const serverCache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      serverCache.writeQuery(artifact, {}, { name: 'Alice' });
      const snapshot = serverCache.extract();

      const clientCache = new Cache(schema);
      clientCache.hydrate(snapshot);

      const result = clientCache.readQuery(artifact, {});
      expect(result.data).toEqual({ name: 'Alice' });
    });

    it('should handle empty snapshot', () => {
      const cache = new Cache(schema);
      const emptySnapshot = cache.extract();
      const cache2 = new Cache(schema);
      cache2.hydrate(emptySnapshot);
      expect(
        cache2.readQuery(createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]), {})
          .data,
      ).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache data', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      cache.clear();
      expect(cache.readQuery(artifact, {}).data).toBeNull();
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
      expect(cache.readQuery(artifact, {}).data).toBeNull();
    });

    it('should clear all subscriptions', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);

      cache.writeQuery(artifact, {}, { name: 'Alice' });
      const listener = vi.fn();
      cache.subscribeQuery(artifact, {}, listener);
      cache.writeQuery(artifact, {}, { name: 'Bob' });
      expect(listener).toHaveBeenCalledTimes(1);

      cache.clear();
      cache.writeQuery(artifact, {}, { name: 'Charlie' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should clear stale state', () => {
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
      expect(cache.readQuery(artifact, {}).stale).toBe(false);
    });

    it('should allow writing to cache after clear', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      cache.clear();
      cache.writeQuery(artifact, {}, { name: 'Bob' });
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: 'Bob' });
    });
  });

  describe('stale', () => {
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
      expect(cache.readQuery(artifact, {}).stale).toBe(false);
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
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
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
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
    });

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
      expect(cache.readQuery(artifact, {}).stale).toBe(false);
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
      expect(cache.readQuery(artifact, {}).stale).toBe(false);
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

      expect(cache.readQuery(nameArtifact, {}).stale).toBe(false);
      expect(cache.readQuery(emailArtifact, {}).stale).toBe(true);
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
      expect(cache.readQuery(fullArtifact, {}).stale).toBe(true);
    });

    it('should return stale: true after root query invalidation', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetName', [{ kind: 'Field', name: 'name', type: 'String' }]);
      cache.writeQuery(artifact, {}, { name: 'Alice' });
      cache.invalidate({ __typename: 'Query' });
      expect(cache.readQuery(artifact, {}).stale).toBe(true);
      expect(cache.readQuery(artifact, {}).data).toEqual({ name: 'Alice' });
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(cache.readQuery(artifact, {}).stale).toBe(false);

      unsubscribe();
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

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

      unsubscribe();
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });

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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(cache.readQuery(artifact, {}).stale).toBe(true);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(cache.readQuery(artifact, {}).stale).toBe(true);

      unsubscribe();
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
      const { unsubscribe } = cache.subscribeFragment(fragmentArtifact, fragmentRef, listener);

      cache.invalidate({ __typename: 'User', id: '1' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(null);

      unsubscribe();
    });
  });

  describe('fragment arguments', () => {
    it('readFragment uses fragment vars from fragment ref', () => {
      const cache = new Cache(schema);
      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Avatar',
              args: { size: { kind: 'literal', value: 80 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 80 } } },
              ],
            },
          ],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', profilePic: 'pic-80.jpg' } });

      const queryResult = cache.readQuery(queryArtifact, {});
      const fragmentRef = (queryResult.data as Record<string, unknown>).user as FragmentRefs<string>;

      expect((fragmentRef as unknown as Record<string, unknown>)[FragmentRefKey]).toBe('User:1');
      expect((fragmentRef as unknown as Record<string, unknown>)[FragmentVarsKey]).toEqual({ Avatar: { size: 80 } });

      const fragmentArtifact = createArtifact('fragment', 'Avatar', [
        { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'variable', name: 'size' } } },
      ]);
      expect(cache.readFragment(fragmentArtifact, fragmentRef).data).toEqual({ profilePic: 'pic-80.jpg' });
    });

    it('readFragment without fragment vars is backward compatible', () => {
      const cache = new Cache(schema);
      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'UserFields',
              selections: [{ kind: 'Field', name: 'name', type: 'String' }],
            },
          ],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });

      const queryResult = cache.readQuery(queryArtifact, {});
      const fragmentRef = (queryResult.data as Record<string, unknown>).user as FragmentRefs<string>;

      const fragmentArtifact = createArtifact('fragment', 'UserFields', [
        { kind: 'Field', name: 'name', type: 'String' },
      ]);
      expect(cache.readFragment(fragmentArtifact, fragmentRef).data).toEqual({ name: 'Alice' });
    });

    it('different fragment args produce different reads', () => {
      const cache = new Cache(schema);
      const queryArtifact = createArtifact('query', 'GetUsers', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          alias: 'user1',
          args: { id: { kind: 'literal', value: '1' } },
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Avatar',
              args: { size: { kind: 'literal', value: 50 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 50 } } },
              ],
            },
          ],
        },
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          alias: 'user2',
          args: { id: { kind: 'literal', value: '2' } },
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Avatar',
              args: { size: { kind: 'literal', value: 200 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 200 } } },
              ],
            },
          ],
        },
      ]);

      cache.writeQuery(
        queryArtifact,
        {},
        {
          user1: { __typename: 'User', id: '1', profilePic: 'pic-50.jpg' },
          user2: { __typename: 'User', id: '2', profilePic: 'pic-200.jpg' },
        },
      );

      const queryResult = cache.readQuery(queryArtifact, {});
      const data = queryResult.data as Record<string, FragmentRefs<string>>;

      const fragmentArtifact = createArtifact('fragment', 'Avatar', [
        { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'variable', name: 'size' } } },
      ]);

      const result1 = cache.readFragment(fragmentArtifact, data.user1!);
      const result2 = cache.readFragment(fragmentArtifact, data.user2!);

      expect(result1.data).toEqual({ profilePic: 'pic-50.jpg' });
      expect(result2.data).toEqual({ profilePic: 'pic-200.jpg' });
    });

    it('readFragment resolves operation variables alongside fragment vars', () => {
      const cache = new Cache(schema);
      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'UserCard',
              args: { picSize: { kind: 'literal', value: 80 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 80 } } },
                { kind: 'Field', name: 'posts', type: 'String', args: { limit: { kind: 'variable', name: 'limit' } } },
              ],
            },
          ],
        },
      ]);
      cache.writeQuery(
        queryArtifact,
        { limit: 10 },
        {
          user: { __typename: 'User', id: '1', profilePic: 'pic-80.jpg', posts: 'post-list' },
        },
      );

      const queryResult = cache.readQuery(queryArtifact, { limit: 10 });
      const fragmentRef = (queryResult.data as Record<string, unknown>).user as FragmentRefs<string>;

      const fragmentArtifact = createArtifact('fragment', 'UserCard', [
        { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'variable', name: 'picSize' } } },
        { kind: 'Field', name: 'posts', type: 'String', args: { limit: { kind: 'variable', name: 'limit' } } },
      ]);

      const fragmentResult = cache.readFragment(fragmentArtifact, fragmentRef);
      expect(fragmentResult.data).toEqual({ profilePic: 'pic-80.jpg', posts: 'post-list' });
    });

    it('same entity with same fragment but different args produces independent reads', () => {
      const cache = new Cache(schema);
      const queryArtifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Avatar',
              args: { size: { kind: 'literal', value: 50 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 50 } } },
              ],
            },
          ],
        },
      ]);
      cache.writeQuery(queryArtifact, {}, { user: { __typename: 'User', id: '1', profilePic: 'pic-50.jpg' } });

      const queryResult = cache.readQuery(queryArtifact, {});
      const fragmentRef50 = (queryResult.data as Record<string, unknown>).user as FragmentRefs<string>;

      const queryArtifact2 = createArtifact('query', 'GetUser2', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Avatar',
              args: { size: { kind: 'literal', value: 200 } },
              selections: [
                { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'literal', value: 200 } } },
              ],
            },
          ],
        },
      ]);
      cache.writeQuery(queryArtifact2, {}, { user: { __typename: 'User', id: '1', profilePic: 'pic-200.jpg' } });

      const queryResult2 = cache.readQuery(queryArtifact2, {});
      const fragmentRef200 = (queryResult2.data as Record<string, unknown>).user as FragmentRefs<string>;

      const fragmentArtifact = createArtifact('fragment', 'Avatar', [
        { kind: 'Field', name: 'profilePic', type: 'String', args: { size: { kind: 'variable', name: 'size' } } },
      ]);

      const result50 = cache.readFragment(fragmentArtifact, fragmentRef50);
      const result200 = cache.readFragment(fragmentArtifact, fragmentRef200);

      expect(result50.data).toEqual({ profilePic: 'pic-50.jpg' });
      expect(result200.data).toEqual({ profilePic: 'pic-200.jpg' });
    });
  });

  describe('union type with entity types and inline fragments', () => {
    const unionSchema: SchemaMeta = {
      entities: {
        Entity: { keyFields: ['id'] },
        Post: { keyFields: ['id'] },
        Folder: { keyFields: ['id'] },
        Site: { keyFields: ['id'] },
      },
      inputs: {},
      scalars: {},
    };

    it('should not return partial when union field has non-matching entity type', () => {
      const cache = new Cache(unionSchema);
      const artifact = createArtifact('query', 'GetEntity', [
        {
          kind: 'Field',
          name: 'entity',
          type: 'Entity',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'site',
              type: 'Site',
              selections: [
                { kind: 'Field', name: '__typename', type: 'String' },
                { kind: 'Field', name: 'id', type: 'ID' },
                {
                  kind: 'Field',
                  name: 'entities',
                  type: '[Entity]',
                  selections: [
                    { kind: 'Field', name: '__typename', type: 'String' },
                    { kind: 'Field', name: 'id', type: 'ID' },
                    { kind: 'Field', name: 'slug', type: 'String' },
                    {
                      kind: 'Field',
                      name: 'node',
                      type: 'Node',
                      selections: [
                        { kind: 'Field', name: '__typename', type: 'String' },
                        {
                          kind: 'InlineFragment',
                          on: 'Post',
                          selections: [
                            { kind: 'Field', name: 'id', type: 'ID' },
                            { kind: 'Field', name: 'title', type: 'String' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const data = {
        entity: {
          __typename: 'Entity',
          id: 'entity-1',
          site: {
            __typename: 'Site',
            id: 'site-1',
            entities: [
              {
                __typename: 'Entity',
                id: 'entity-1',
                slug: 'my-post',
                node: { __typename: 'Post', id: 'post-1', title: 'My Post' },
              },
              {
                __typename: 'Entity',
                id: 'entity-2',
                slug: 'my-folder',
                node: { __typename: 'Folder' },
              },
            ],
          },
        },
      };

      cache.writeQuery(artifact, {}, data);
      const result = cache.readQuery(artifact, {});
      expect(result.data).not.toBeNull();
    });

    it('should not return partial when union field is null for non-matching entity type', () => {
      const cache = new Cache(unionSchema);
      const artifact = createArtifact('query', 'GetEntities', [
        {
          kind: 'Field',
          name: 'entities',
          type: '[Entity]',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'node',
              type: 'Node',
              selections: [
                { kind: 'Field', name: '__typename', type: 'String' },
                {
                  kind: 'InlineFragment',
                  on: 'Post',
                  selections: [
                    { kind: 'Field', name: 'id', type: 'ID' },
                    { kind: 'Field', name: 'title', type: 'String' },
                  ],
                },
              ],
            },
          ],
        },
      ]);
      const data = {
        entities: [
          { __typename: 'Entity', id: 'entity-1', node: { __typename: 'Post', id: 'post-1', title: 'Hello' } },
          { __typename: 'Entity', id: 'entity-2', node: { __typename: 'Folder' } },
        ],
      };
      cache.writeQuery(artifact, {}, data);
      const result = cache.readQuery(artifact, {});
      expect(result.data).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty query selections', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'EmptyQuery', []);
      cache.writeQuery(artifact, {}, {});
      expect(cache.readQuery(artifact, {}).data).toEqual({});
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
      expect(cache.readQuery(artifact, {}).data).toEqual({
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
      cache.writeQuery(artifact, {}, { comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great post!' } });
      expect(cache.readQuery(artifact, {}).data).toEqual({
        comment: { __typename: 'Comment', postId: '1', id: '1', text: 'Great post!' },
      });
    });
  });

  describe('fine-grained reactivity', () => {
    it('T27: nested entity field change emits only changed field patches', () => {
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
                { kind: 'Field', name: 'email', type: 'String' },
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
            author: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
          },
        },
      );

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(
        artifact,
        {},
        {
          post: {
            __typename: 'Post',
            id: '1',
            author: { __typename: 'User', id: '1', name: 'Bob', email: 'alice@example.com' },
          },
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBeGreaterThan(0);
      const namePatch = patches.find(
        (p): p is Extract<Patch, { type: 'set' }> =>
          p.type === 'set' && JSON.stringify(p.path) === JSON.stringify(['post', 'author', 'name']),
      );
      expect(namePatch).toBeDefined();
      expect(namePatch!.value).toBe('Bob');

      const emailPatch = patches.find(
        (p): p is Extract<Patch, { type: 'set' }> =>
          p.type === 'set' && JSON.stringify(p.path) === JSON.stringify(['post', 'author', 'email']),
      );
      expect(emailPatch).toBeUndefined();

      unsubscribe();
    });

    it('T28: embedded object change emits whole-object set patch', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'settings',
              type: 'Settings',
              selections: [
                { kind: 'Field', name: 'theme', type: 'String' },
                { kind: 'Field', name: 'language', type: 'String' },
              ],
            },
          ],
        },
      ]);
      cache.writeQuery(
        artifact,
        {},
        {
          user: {
            __typename: 'User',
            id: '1',
            settings: { theme: 'dark', language: 'en' },
          },
        },
      );

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(
        artifact,
        {},
        {
          user: {
            __typename: 'User',
            id: '1',
            settings: { theme: 'light', language: 'en' },
          },
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      const setPatch = patches.find(
        (p): p is Extract<Patch, { type: 'set' }> =>
          p.type === 'set' && JSON.stringify(p.path) === JSON.stringify(['user', 'settings']),
      );
      expect(setPatch).toBeDefined();
      const value = setPatch!.value as Record<string, unknown>;
      expect(value.theme).toBe('light');
      expect(value.language).toBe('en');

      unsubscribe();
    });

    it('T29: non-entity array change emits whole-array set patch', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetUser', [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'tags', type: 'String', array: true },
          ],
        },
      ]);
      cache.writeQuery(
        artifact,
        {},
        {
          user: {
            __typename: 'User',
            id: '1',
            tags: ['javascript', 'typescript'],
          },
        },
      );

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(
        artifact,
        {},
        {
          user: {
            __typename: 'User',
            id: '1',
            tags: ['javascript', 'typescript', 'graphql'],
          },
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      const setPatch = patches.find(
        (p): p is Extract<Patch, { type: 'set' }> =>
          p.type === 'set' && JSON.stringify(p.path) === JSON.stringify(['user', 'tags']),
      );
      expect(setPatch).toBeDefined();
      expect(setPatch!.value).toEqual(['javascript', 'typescript', 'graphql']);

      unsubscribe();
    });

    it('T30: hydrate then subscribeQuery builds entry tree correctly', () => {
      const serverCache = new Cache(schema);
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
      serverCache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Alice' } });
      const snapshot = serverCache.extract();

      const clientCache = new Cache(schema);
      clientCache.hydrate(snapshot);

      const listener = vi.fn();
      const { data, subscription, unsubscribe } = clientCache.subscribeQuery(artifact, {}, listener);

      expect(data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(subscription.entryTree).toBeDefined();
      expect(subscription.entryTree.children.size).toBeGreaterThan(0);

      clientCache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });
      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });

      unsubscribe();
    });

    it('T31: isStale with deeply nested subtree stale', () => {
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
      const { subscription, unsubscribe } = cache.subscribeQuery(artifact, {}, vi.fn());

      cache.invalidate({ __typename: 'User', id: '1', $field: 'name' });
      expect(cache.isStale(subscription)).toBe(true);

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
      expect(cache.isStale(subscription)).toBe(false);

      unsubscribe();
    });

    it('T32: circular entity references do not cause infinite loops', () => {
      const cache = new Cache(schema);
      const artifact = createArtifact('query', 'GetPost', [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'title', type: 'String' },
            {
              kind: 'Field',
              name: 'author',
              type: 'User',
              selections: [
                { kind: 'Field', name: '__typename', type: 'String' },
                { kind: 'Field', name: 'id', type: 'ID' },
                { kind: 'Field', name: 'name', type: 'String' },
                {
                  kind: 'Field',
                  name: 'posts',
                  type: 'Post',
                  array: true,
                  selections: [
                    { kind: 'Field', name: '__typename', type: 'String' },
                    { kind: 'Field', name: 'id', type: 'ID' },
                    { kind: 'Field', name: 'title', type: 'String' },
                  ],
                },
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
            title: 'Hello',
            author: {
              __typename: 'User',
              id: '1',
              name: 'Alice',
              posts: [
                { __typename: 'Post', id: '1', title: 'Hello' },
                { __typename: 'Post', id: '2', title: 'World' },
              ],
            },
          },
        },
      );

      const result = cache.readQuery(artifact, {});
      expect(result.data).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          title: 'Hello',
          author: {
            __typename: 'User',
            id: '1',
            name: 'Alice',
            posts: [
              { __typename: 'Post', id: '1', title: 'Hello' },
              { __typename: 'Post', id: '2', title: 'World' },
            ],
          },
        },
      });

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(
        artifact,
        {},
        {
          post: {
            __typename: 'Post',
            id: '1',
            title: 'Hello Updated',
            author: {
              __typename: 'User',
              id: '1',
              name: 'Alice',
              posts: [
                { __typename: 'Post', id: '1', title: 'Hello Updated' },
                { __typename: 'Post', id: '2', title: 'World' },
              ],
            },
          },
        },
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBeGreaterThan(0);

      const updated = cache.readQuery(artifact, {});
      expect(updated.data).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          title: 'Hello Updated',
          author: {
            __typename: 'User',
            id: '1',
            name: 'Alice',
            posts: [
              { __typename: 'Post', id: '1', title: 'Hello Updated' },
              { __typename: 'Post', id: '2', title: 'World' },
            ],
          },
        },
      });

      unsubscribe();
    });

    it('T33: large arrays (100+ items) correctness', () => {
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

      const users = Array.from({ length: 150 }, (_, i) => ({
        __typename: 'User' as const,
        id: String(i),
        name: `User ${i}`,
      }));
      cache.writeQuery(artifact, {}, { users });

      const result = cache.readQuery(artifact, {});
      expect(result.data).toEqual({ users });
      expect((result.data as { users: unknown[] }).users.length).toBe(150);

      const listener = vi.fn();
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      const updatedUsers = users.map((u) => (u.id === '75' ? { ...u, name: 'Updated User 75' } : u));
      cache.writeQuery(artifact, {}, { users: updatedUsers });

      expect(listener).toHaveBeenCalledTimes(1);
      const patches = listener.mock.calls[0]![0] as Patch[];
      expect(patches.length).toBeGreaterThan(0);

      const updatedResult = cache.readQuery(artifact, {});
      expect((updatedResult.data as { users: { id: string; name: string }[] }).users[75]!.name).toBe('Updated User 75');

      unsubscribe();
    });

    it('T34: consecutive writeQuery calls produce independent patch emissions', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });
      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Charlie' } });

      expect(listener).toHaveBeenCalledTimes(2);
      const patches1 = listener.mock.calls[0]![0] as Patch[];
      const patches2 = listener.mock.calls[1]![0] as Patch[];
      expect(patches1).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
      expect(patches2).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Charlie' });

      unsubscribe();
    });

    it('T35: immediate teardown after subscribe cleans up properly', () => {
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
      const { unsubscribe } = cache.subscribeQuery(artifact, {}, listener);
      unsubscribe();

      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Bob' } });
      expect(listener).not.toHaveBeenCalled();

      const listener2 = vi.fn();
      const sub2 = cache.subscribeQuery(artifact, {}, listener2);
      cache.writeQuery(artifact, {}, { user: { __typename: 'User', id: '1', name: 'Charlie' } });
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();

      sub2.unsubscribe();
    });
  });
});
