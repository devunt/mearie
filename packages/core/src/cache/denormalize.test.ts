import { describe, it, expect } from 'vitest';
import { denormalize } from './denormalize.ts';
import { RootFieldKey, EntityLinkKey, FragmentRefKey } from './constants.ts';
import type { Storage, StorageKey, FieldKey } from './types.ts';
import type { Selection } from '@mearie/shared';

const denormalizeTest = (
  selections: readonly Selection[],
  storage: Storage,
  variables?: Record<string, unknown>,
  value?: unknown,
) => {
  variables ??= {};
  value ??= storage[RootFieldKey];

  const calls: [StorageKey, FieldKey][] = [];

  const result = denormalize(selections, storage, value, variables, (storageKey, fieldKey) => {
    calls.push([storageKey, fieldKey]);
  });

  return { ...result, calls };
};

const expectSameCalls = (actual: [StorageKey, FieldKey][], expected: [StorageKey, FieldKey][]) => {
  expect(actual).toHaveLength(expected.length);
  for (const call of expected) {
    expect(actual).toContainEqual(call);
  }
};

describe('denormalize', () => {
  describe('basic fields', () => {
    it('single scalar field', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'name@{}': 'Alice' },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ name: 'Alice' });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('multiple scalar fields', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'age', type: 'String' },
        { kind: 'Field' as const, name: 'active', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'age@{}': 30,
          'active@{}': true,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
        age: 30,
        active: true,
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'age@{}'],
        [RootFieldKey, 'active@{}'],
      ]);
    });

    it('null value', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'name@{}': null },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ name: null });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('undefined value (missing from storage)', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
      const storage = {
        [RootFieldKey]: {},
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });
  });

  describe('nested objects', () => {
    it('nested object without typename', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('deeply nested objects', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'level1',
          type: 'Level1',
          selections: [
            {
              kind: 'Field' as const,
              name: 'level2',
              type: 'Level2',
              selections: [{ kind: 'Field' as const, name: 'value', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'level1@{}': {
            'level2@{}': {
              'value@{}': 'deep',
            },
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        level1: {
          level2: {
            value: 'deep',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'level1@{}']]);
    });

    it('nested null object', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': null },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ user: null });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('nested object with missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          name: 'Alice',
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });
  });

  describe('arrays', () => {
    it('array of scalars', () => {
      const selections = [{ kind: 'Field' as const, name: 'tags', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'tags@{}': ['typescript', 'graphql', 'cache'] },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ tags: ['typescript', 'graphql', 'cache'] });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'tags@{}']]);
    });

    it('array of objects without typename', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'items',
          type: 'Item',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'value', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'items@{}': [
            { 'name@{}': 'Item 1', 'value@{}': 100 },
            { 'name@{}': 'Item 2', 'value@{}': 200 },
          ],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        items: [
          { name: 'Item 1', value: 100 },
          { name: 'Item 2', value: 200 },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'items@{}']]);
    });

    it('array with null elements', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'items',
          type: 'Item',
          selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'items@{}': [{ 'name@{}': 'Item 1' }, null, { 'name@{}': 'Item 3' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        items: [{ name: 'Item 1' }, null, { name: 'Item 3' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'items@{}']]);
    });

    it('empty array', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'items',
          type: 'Item',
          selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'items@{}': [] },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ items: [] });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'items@{}']]);
    });

    it('nested arrays', () => {
      const selections = [{ kind: 'Field' as const, name: 'matrix', type: 'String' }];
      const storage = {
        [RootFieldKey]: {
          'matrix@{}': [
            [1, 2],
            [3, 4],
          ],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        matrix: [
          [1, 2],
          [3, 4],
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'matrix@{}']]);
    });

    it('deep nested arrays in non-entity objects', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'data',
          type: 'Data',
          selections: [
            {
              kind: 'Field' as const,
              name: 'items',
              type: 'Item',
              selections: [{ kind: 'Field' as const, name: 'values', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'data@{}': {
            'items@{}': [{ 'values@{}': [1, 2, 3] }, { 'values@{}': [4, 5, 6] }],
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        data: {
          items: [{ values: [1, 2, 3] }, { values: [4, 5, 6] }],
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'data@{}']]);
    });

    it('array elements with missing fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'items',
          type: 'Item',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'value', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'items@{}': [{ 'name@{}': 'Item 1', 'value@{}': 100 }, { 'name@{}': 'Item 2' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        items: [{ name: 'Item 1', value: 100 }, { name: 'Item 2' }],
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'items@{}']]);
    });
  });

  describe('entities', () => {
    it('entity with single key field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('entity with multiple key fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'comment',
          type: 'Comment',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'postId', type: 'ID' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'text', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'comment@{}': { [EntityLinkKey]: 'Comment:post-1:comment-1' } },
        'Comment:post-1:comment-1': {
          '__typename@{}': 'Comment',
          'postId@{}': 'post-1',
          'id@{}': 'comment-1',
          'text@{}': 'Great post!',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        comment: {
          __typename: 'Comment',
          postId: 'post-1',
          id: 'comment-1',
          text: 'Great post!',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'comment@{}'],
        ['Comment:post-1:comment-1', '__typename@{}'],
        ['Comment:post-1:comment-1', 'postId@{}'],
        ['Comment:post-1:comment-1', 'id@{}'],
        ['Comment:post-1:comment-1', 'text@{}'],
      ]);
    });

    it('array of entities', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
      ]);
    });

    it('nested entities', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'author',
              type: 'User',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'post@{}': { [EntityLinkKey]: 'Post:1' } },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello',
          'author@{}': { [EntityLinkKey]: 'User:10' },
        },
        'User:10': {
          '__typename@{}': 'User',
          'id@{}': '10',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          title: 'Hello',
          author: {
            __typename: 'User',
            id: '10',
            name: 'Alice',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'post@{}'],
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'title@{}'],
        ['Post:1', 'author@{}'],
        ['User:10', '__typename@{}'],
        ['User:10', 'id@{}'],
        ['User:10', 'name@{}'],
      ]);
    });

    it('same entity referenced in multiple fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'currentUser',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
        {
          kind: 'Field' as const,
          name: 'author',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'currentUser@{}': { [EntityLinkKey]: 'User:1' },
          'author@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        currentUser: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
        author: {
          __typename: 'User',
          id: '1',
          email: 'alice@example.com',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'currentUser@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        [RootFieldKey, 'author@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'email@{}'],
      ]);
    });

    it('same entity appears multiple times in array', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }, { [EntityLinkKey]: 'User:1' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
          { __typename: 'User', id: '1', name: 'Alice' },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('entity reference missing from storage', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: null,
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
      ]);
    });

    it('entity with missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });
  });

  describe('field arguments', () => {
    it('field with literal arguments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal' as const, value: 10 },
            offset: { kind: 'literal' as const, value: 0 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"limit":10,"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"limit":10,"offset":0}']]);
    });

    it('field with variable arguments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
            offset: { kind: 'variable' as const, name: 'offset' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"limit":10,"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = { limit: 10, offset: 0 };

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"limit":10,"offset":0}']]);
    });

    it('field with different argument values', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          alias: 'posts1',
          args: {
            limit: { kind: 'literal' as const, value: 5 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          alias: 'posts2',
          args: {
            limit: { kind: 'literal' as const, value: 10 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"limit":5}': [{ 'title@{}': 'Post 1' }],
          'posts@{"limit":10}': [{ 'title@{}': 'Post 2' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        posts1: [{ title: 'Post 1' }],
        posts2: [{ title: 'Post 2' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'posts@{"limit":5}'],
        [RootFieldKey, 'posts@{"limit":10}'],
      ]);
    });

    it('field with complex argument values', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            filter: {
              kind: 'literal' as const,
              value: { status: 'published', tags: ['typescript', 'graphql'] },
            },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"filter":{"status":"published","tags":["typescript","graphql"]}}': [{ 'title@{}': 'Post 1' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'posts@{"filter":{"status":"published","tags":["typescript","graphql"]}}'],
      ]);
    });

    it('field with arguments missing from storage', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal' as const, value: 10 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {},
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"limit":10}']]);
    });
  });

  describe('field aliases', () => {
    it('single aliased field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'name',
          type: 'String',
          alias: 'userName',
        },
      ];
      const storage = {
        [RootFieldKey]: { 'name@{}': 'Alice' },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ userName: 'Alice' });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('multiple aliases for same field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          alias: 'currentUser',
          type: 'User',
          args: { id: { kind: 'literal' as const, value: '1' } },
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
        {
          kind: 'Field' as const,
          name: 'user',
          alias: 'otherUser',
          type: 'User',
          args: { id: { kind: 'literal' as const, value: '2' } },
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{"id":"1"}': { [EntityLinkKey]: 'User:1' },
          'user@{"id":"2"}': { [EntityLinkKey]: 'User:2' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        currentUser: { __typename: 'User', id: '1', name: 'Alice' },
        otherUser: { __typename: 'User', id: '2', name: 'Bob' },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{"id":"1"}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        [RootFieldKey, 'user@{"id":"2"}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
      ]);
    });

    it('aliased nested field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'post',
          type: 'Post',
          selections: [
            {
              kind: 'Field' as const,
              name: 'authorName',
              type: 'String',
              alias: 'writerName',
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'post@{}': {
            'authorName@{}': 'Alice',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        post: {
          writerName: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'post@{}']]);
    });

    it('aliased field missing from storage', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'name',
          type: 'String',
          alias: 'userName',
        },
      ];
      const storage = {
        [RootFieldKey]: {},
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });
  });

  describe('fragment spreads', () => {
    it('simple fragment spread', () => {
      const selections = [
        {
          kind: 'FragmentSpread' as const,
          name: 'UserFields',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });

    it('fragment spread with entity', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('nested fragment spreads', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'ProfileFragment',
              selections: [
                {
                  kind: 'Field' as const,
                  name: 'profile',
                  type: 'Profile',
                  selections: [{ kind: 'Field' as const, name: 'bio', type: 'String' }],
                },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'profile@{}': {
              'bio@{}': 'Developer',
            },
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          name: 'Alice',
          profile: {
            bio: 'Developer',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('multiple fragment spreads', () => {
      const selections = [
        {
          kind: 'FragmentSpread' as const,
          name: 'BasicInfo',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
        {
          kind: 'FragmentSpread' as const,
          name: 'AgeInfo',
          selections: [{ kind: 'Field' as const, name: 'age', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'age@{}'],
      ]);
    });

    it('fragment spread with missing field', () => {
      const selections = [
        {
          kind: 'FragmentSpread' as const,
          name: 'UserFields',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });
  });

  describe('inline fragments', () => {
    it('matching typename', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('non-matching typename', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'Post',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'Post',
              selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'Post:1' } },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'Post',
          id: '1',
          title: 'Hello',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'title@{}'],
      ]);
    });

    it('nested inline fragments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                {
                  kind: 'Field' as const,
                  name: 'profile',
                  type: 'Profile',
                  selections: [{ kind: 'Field' as const, name: 'bio', type: 'String' }],
                },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'profile@{}': {
            'bio@{}': 'Developer',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          profile: {
            bio: 'Developer',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'profile@{}'],
      ]);
    });

    it('multiple inline fragments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'email', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });

    it('inline fragment with missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });
  });

  describe('mixed selections', () => {
    it('fields and fragment spreads', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread' as const,
              name: 'UserDetails',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
      ]);
    });

    it('fields and inline fragments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });

    it('fragment spreads and inline fragments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread' as const,
              name: 'BasicInfo',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'age', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          age: 30,
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'age@{}'],
      ]);
    });

    it('all selection types', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'ContactInfo',
              selections: [{ kind: 'Field' as const, name: 'email', type: 'String' }],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [
                { kind: 'Field' as const, name: 'age', type: 'String' },
                { kind: 'Field' as const, name: 'bio', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
          'bio@{}': 'Developer',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          age: 30,
          bio: 'Developer',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'age@{}'],
        ['User:1', 'bio@{}'],
      ]);
    });

    it('mixed selections with missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread' as const,
              name: 'BasicInfo',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'age', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        entity: {
          __typename: 'User',
          id: '1',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'age@{}'],
      ]);
    });
  });

  describe('complex scenarios', () => {
    it('deeply nested entities with arrays', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'posts',
              type: 'Post',
              array: true,
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'title', type: 'String' },
                {
                  kind: 'Field' as const,
                  name: 'comments',
                  type: 'Comment',
                  array: true,
                  selections: [
                    { kind: 'Field' as const, name: '__typename', type: 'String' },
                    { kind: 'Field' as const, name: 'postId', type: 'ID' },
                    { kind: 'Field' as const, name: 'id', type: 'ID' },
                    { kind: 'Field' as const, name: 'text', type: 'String' },
                  ],
                },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'posts@{}': [{ [EntityLinkKey]: 'Post:10' }],
        },
        'Post:10': {
          '__typename@{}': 'Post',
          'id@{}': '10',
          'title@{}': 'First Post',
          'comments@{}': [{ [EntityLinkKey]: 'Comment:10:c1' }],
        },
        'Comment:10:c1': {
          '__typename@{}': 'Comment',
          'postId@{}': '10',
          'id@{}': 'c1',
          'text@{}': 'Great!',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          posts: [
            {
              __typename: 'Post',
              id: '10',
              title: 'First Post',
              comments: [
                {
                  __typename: 'Comment',
                  postId: '10',
                  id: 'c1',
                  text: 'Great!',
                },
              ],
            },
          ],
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'posts@{}'],
        ['Post:10', '__typename@{}'],
        ['Post:10', 'id@{}'],
        ['Post:10', 'title@{}'],
        ['Post:10', 'comments@{}'],
        ['Comment:10:c1', '__typename@{}'],
        ['Comment:10:c1', 'postId@{}'],
        ['Comment:10:c1', 'id@{}'],
        ['Comment:10:c1', 'text@{}'],
      ]);
    });

    it('mixed entities and non-entities', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'stats',
              type: 'Stats',
              selections: [
                { kind: 'Field' as const, name: 'followers', type: 'String' },
                { kind: 'Field' as const, name: 'following', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'stats@{}': {
            'followers@{}': 100,
            'following@{}': 50,
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          stats: {
            followers: 100,
            following: 50,
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'stats@{}'],
      ]);
    });

    it('entity array with null elements', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, null, { [EntityLinkKey]: 'User:2' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        users: [{ __typename: 'User', id: '1', name: 'Alice' }, null, { __typename: 'User', id: '2', name: 'Bob' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
      ]);
    });

    it('circular entity references', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'bestFriend',
              type: 'User',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'bestFriend@{}': { [EntityLinkKey]: 'User:2' },
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          bestFriend: {
            __typename: 'User',
            id: '2',
            name: 'Bob',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'bestFriend@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
      ]);
    });

    it('deeply nested structure with missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'Field' as const,
              name: 'posts',
              type: 'Post',
              array: true,
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'title', type: 'String' },
                { kind: 'Field' as const, name: 'content', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'posts@{}': [{ [EntityLinkKey]: 'Post:10' }],
        },
        'Post:10': {
          '__typename@{}': 'Post',
          'id@{}': '10',
          'title@{}': 'Hello',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          posts: [
            {
              __typename: 'Post',
              id: '10',
              title: 'Hello',
            },
          ],
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'posts@{}'],
        ['Post:10', '__typename@{}'],
        ['Post:10', 'id@{}'],
        ['Post:10', 'title@{}'],
        ['Post:10', 'content@{}'],
      ]);
    });
  });

  describe('edge cases', () => {
    it('empty selections', () => {
      const selections: Selection[] = [];
      const storage = {
        [RootFieldKey]: { 'name@{}': 'Alice' },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(false);
      expectSameCalls(calls, []);
    });

    it('denormalize result is empty object', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {},
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });

    it('all fields missing', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
        { kind: 'Field' as const, name: 'age', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {},
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({});
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'age@{}'],
      ]);
    });
  });

  describe('falsy values', () => {
    it('0 as field value', () => {
      const selections = [{ kind: 'Field' as const, name: 'count', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'count@{}': 0 },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ count: 0 });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'count@{}']]);
    });

    it('false as field value', () => {
      const selections = [{ kind: 'Field' as const, name: 'active', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'active@{}': false },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ active: false });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'active@{}']]);
    });

    it('empty string as field value', () => {
      const selections = [{ kind: 'Field' as const, name: 'bio', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'bio@{}': '' },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ bio: '' });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'bio@{}']]);
    });

    it('distinguish between null, undefined, 0, false, and empty string', () => {
      const selections = [
        { kind: 'Field' as const, name: 'nullValue', type: 'String' },
        { kind: 'Field' as const, name: 'undefinedValue', type: 'String' },
        { kind: 'Field' as const, name: 'zeroValue', type: 'String' },
        { kind: 'Field' as const, name: 'falseValue', type: 'String' },
        { kind: 'Field' as const, name: 'emptyString', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {
          'nullValue@{}': null,
          'zeroValue@{}': 0,
          'falseValue@{}': false,
          'emptyString@{}': '',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        nullValue: null,
        zeroValue: 0,
        falseValue: false,
        emptyString: '',
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'nullValue@{}'],
        [RootFieldKey, 'undefinedValue@{}'],
        [RootFieldKey, 'zeroValue@{}'],
        [RootFieldKey, 'falseValue@{}'],
        [RootFieldKey, 'emptyString@{}'],
      ]);
    });

    it('falsy values in arrays', () => {
      const selections = [{ kind: 'Field' as const, name: 'values', type: 'String' }];
      const storage = {
        [RootFieldKey]: { 'values@{}': [0, false, '', null] },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({ values: [0, false, '', null] });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'values@{}']]);
    });
  });

  describe('FragmentRefKey handling', () => {
    it('adds FragmentRefKey when entity has fragment spread', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('no FragmentRefKey without fragment spread', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('no FragmentRefKey for non-entity', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      });
      expect(partial).toBe(false);
      expect((data as Record<string, Record<string, unknown>>).user![FragmentRefKey]).toBeUndefined();
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('FragmentRefKey for nested entity', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'Field' as const,
              name: 'author',
              type: 'User',
              selections: [
                {
                  kind: 'FragmentSpread' as const,
                  name: 'UserFields',
                  selections: [
                    { kind: 'Field' as const, name: '__typename', type: 'String' },
                    { kind: 'Field' as const, name: 'id', type: 'ID' },
                    { kind: 'Field' as const, name: 'name', type: 'String' },
                  ],
                },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'post@{}': { [EntityLinkKey]: 'Post:1' } },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'author@{}': { [EntityLinkKey]: 'User:10' },
        },
        'User:10': {
          '__typename@{}': 'User',
          'id@{}': '10',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        post: {
          __typename: 'Post',
          id: '1',
          author: {
            [FragmentRefKey]: 'User:10',
          },
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'post@{}'],
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'author@{}'],
      ]);
    });

    it('multiple fragment spreads add FragmentRefKey', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'BasicInfo',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
            {
              kind: 'FragmentSpread' as const,
              name: 'ContactInfo',
              selections: [{ kind: 'Field' as const, name: 'email', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('fragment spread only without fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });
  });

  describe('denormalize starting from entity (fragment-like)', () => {
    it('should denormalize entity fields when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });

    it('should denormalize nested entity reference when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'title', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'author',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello World',
          'author@{}': { [EntityLinkKey]: 'User:10' },
        },
        'User:10': {
          '__typename@{}': 'User',
          'id@{}': '10',
          'name@{}': 'Alice',
        },
      };

      const value = { [EntityLinkKey]: 'Post:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'Post',
        id: '1',
        title: 'Hello World',
        author: {
          __typename: 'User',
          id: '10',
          name: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'title@{}'],
        ['Post:1', 'author@{}'],
        ['User:10', '__typename@{}'],
        ['User:10', 'id@{}'],
        ['User:10', 'name@{}'],
      ]);
    });

    it('should denormalize array of entities when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'posts@{}': [{ [EntityLinkKey]: 'Post:10' }, { [EntityLinkKey]: 'Post:20' }],
        },
        'Post:10': {
          '__typename@{}': 'Post',
          'id@{}': '10',
          'title@{}': 'First Post',
        },
        'Post:20': {
          '__typename@{}': 'Post',
          'id@{}': '20',
          'title@{}': 'Second Post',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        posts: [
          { __typename: 'Post', id: '10', title: 'First Post' },
          { __typename: 'Post', id: '20', title: 'Second Post' },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'posts@{}'],
        ['Post:10', '__typename@{}'],
        ['Post:10', 'id@{}'],
        ['Post:10', 'title@{}'],
        ['Post:20', '__typename@{}'],
        ['Post:20', 'id@{}'],
        ['Post:20', 'title@{}'],
      ]);
    });

    it('should handle embedded non-entity object when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'settings',
          type: 'Settings',
          selections: [
            { kind: 'Field' as const, name: 'theme', type: 'String' },
            { kind: 'Field' as const, name: 'language', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'settings@{}': {
            'theme@{}': 'dark',
            'language@{}': 'en',
          },
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        settings: {
          theme: 'dark',
          language: 'en',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'settings@{}'],
      ]);
    });

    it('should handle fragment spread when starting from entity', () => {
      const selections = [
        {
          kind: 'FragmentSpread' as const,
          name: 'UserFields',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        [FragmentRefKey]: 'User:1',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, []);
    });

    it('should handle inline fragment when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        {
          kind: 'InlineFragment' as const,
          on: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
      ]);
    });

    it('should handle missing field when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
        { kind: 'Field' as const, name: 'age', type: 'String' },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
        ['User:1', 'age@{}'],
      ]);
    });

    it('should handle missing nested entity reference when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'title', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'author',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello World',
          'author@{}': { [EntityLinkKey]: 'User:999' },
        },
      };

      const value = { [EntityLinkKey]: 'Post:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'Post',
        id: '1',
        title: 'Hello World',
        author: null,
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'title@{}'],
        ['Post:1', 'author@{}'],
        ['User:999', '__typename@{}'],
      ]);
    });

    it('should return null and partial when entity does not exist in storage', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const storage = {
        [RootFieldKey]: {},
      };

      const value = { [EntityLinkKey]: 'User:999' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toBeNull();
      expect(partial).toBe(true);
      expectSameCalls(calls, [['User:999', '__typename@{}']]);
    });

    it('should handle deeply nested structure when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'comments',
              type: 'Comment',
              array: true,
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'postId', type: 'ID' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'text', type: 'String' },
              ],
            },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'posts@{}': [{ [EntityLinkKey]: 'Post:10' }],
        },
        'Post:10': {
          '__typename@{}': 'Post',
          'id@{}': '10',
          'title@{}': 'First Post',
          'comments@{}': [{ [EntityLinkKey]: 'Comment:10:c1' }],
        },
        'Comment:10:c1': {
          '__typename@{}': 'Comment',
          'postId@{}': '10',
          'id@{}': 'c1',
          'text@{}': 'Great post!',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        posts: [
          {
            __typename: 'Post',
            id: '10',
            title: 'First Post',
            comments: [
              {
                __typename: 'Comment',
                postId: '10',
                id: 'c1',
                text: 'Great post!',
              },
            ],
          },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'posts@{}'],
        ['Post:10', '__typename@{}'],
        ['Post:10', 'id@{}'],
        ['Post:10', 'title@{}'],
        ['Post:10', 'comments@{}'],
        ['Comment:10:c1', '__typename@{}'],
        ['Comment:10:c1', 'postId@{}'],
        ['Comment:10:c1', 'id@{}'],
        ['Comment:10:c1', 'text@{}'],
      ]);
    });

    it('should handle field arguments when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'literal' as const, value: 5 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'posts@{"limit":5}': [{ 'title@{}': 'Post 1' }],
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'posts@{"limit":5}'],
      ]);
    });

    it('should handle variable arguments when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'posts@{"limit":10}': [{ 'title@{}': 'Post 1' }],
        },
      };

      const variables = { limit: 10 };
      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, variables, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'posts@{"limit":10}'],
      ]);
    });

    it('should handle mixed fragment spreads and fields when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        {
          kind: 'FragmentSpread' as const,
          name: 'UserBasicInfo',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
        {
          kind: 'InlineFragment' as const,
          on: 'User',
          selections: [{ kind: 'Field' as const, name: 'age', type: 'String' }],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        age: 30,
        [FragmentRefKey]: 'User:1',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'age@{}'],
      ]);
    });

    it('should handle array with null elements when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'posts@{}': [{ [EntityLinkKey]: 'Post:10' }, null, { [EntityLinkKey]: 'Post:20' }],
        },
        'Post:10': {
          '__typename@{}': 'Post',
          'id@{}': '10',
          'title@{}': 'First Post',
        },
        'Post:20': {
          '__typename@{}': 'Post',
          'id@{}': '20',
          'title@{}': 'Second Post',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        posts: [
          { __typename: 'Post', id: '10', title: 'First Post' },
          null,
          { __typename: 'Post', id: '20', title: 'Second Post' },
        ],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'posts@{}'],
        ['Post:10', '__typename@{}'],
        ['Post:10', 'id@{}'],
        ['Post:10', 'title@{}'],
        ['Post:20', '__typename@{}'],
        ['Post:20', 'id@{}'],
        ['Post:20', 'title@{}'],
      ]);
    });

    it('should handle falsy values when starting from entity', () => {
      const selections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'count', type: 'String' },
        { kind: 'Field' as const, name: 'active', type: 'String' },
        { kind: 'Field' as const, name: 'bio', type: 'String' },
        { kind: 'Field' as const, name: 'nullField', type: 'String' },
      ];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'count@{}': 0,
          'active@{}': false,
          'bio@{}': '',
          'nullField@{}': null,
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({
        __typename: 'User',
        id: '1',
        count: 0,
        active: false,
        bio: '',
        nullField: null,
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'count@{}'],
        ['User:1', 'active@{}'],
        ['User:1', 'bio@{}'],
        ['User:1', 'nullField@{}'],
      ]);
    });

    it('should handle empty selections when starting from entity', () => {
      const selections: Selection[] = [];

      const storage = {
        [RootFieldKey]: {},
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      const value = { [EntityLinkKey]: 'User:1' };
      const { data, partial, calls } = denormalizeTest(selections, storage, {}, value);

      expect(data).toEqual({});
      expect(partial).toBe(false);
      expectSameCalls(calls, []);
    });
  });

  describe('variable handling', () => {
    it('undefined variable value', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = {};

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{}']]);
    });

    it('null variable value', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"limit":null}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = { limit: null };

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"limit":null}']]);
    });

    it('complex object variable', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            filter: { kind: 'variable' as const, name: 'filter' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"filter":{"status":"published"}}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = { filter: { status: 'published' } };

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"filter":{"status":"published"}}']]);
    });

    it('array variable', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            tags: { kind: 'variable' as const, name: 'tags' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"tags":["typescript","graphql"]}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = { tags: ['typescript', 'graphql'] };

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"tags":["typescript","graphql"]}']]);
    });

    it('falsy variable values', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            offset: { kind: 'variable' as const, name: 'offset' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'posts@{"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      };
      const variables = { offset: 0 };

      const { data, partial, calls } = denormalizeTest(selections, storage, variables);

      expect(data).toEqual({
        posts: [{ title: 'Post 1' }],
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"offset":0}']]);
    });
  });

  describe('partial flag behavior', () => {
    it('all fields present', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });

    it('some fields missing', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
        { kind: 'Field' as const, name: 'age', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'age@{}'],
      ]);
    });

    it('entity reference broken', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:999' } },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: null,
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:999', '__typename@{}'],
      ]);
    });

    it('nested field missing propagates partial', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'Field' as const,
              name: 'profile',
              type: 'Profile',
              selections: [
                { kind: 'Field' as const, name: 'bio', type: 'String' },
                { kind: 'Field' as const, name: 'avatar', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'profile@{}': {
              'bio@{}': 'Developer',
            },
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          name: 'Alice',
          profile: {
            bio: 'Developer',
          },
        },
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('array element missing field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2' },
        ],
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'name@{}'],
      ]);
    });

    it('storage has extra fields not in selection', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });
  });

  describe('storage and selection mismatch', () => {
    it('selection field missing from storage', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
      });
      expect(partial).toBe(true);
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });

    it('storage field not in selection is ignored', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
      const storage = {
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        name: 'Alice',
      });
      expect(partial).toBe(false);
      expect((data as Record<string, unknown>).email).toBeUndefined();
      expect((data as Record<string, unknown>).age).toBeUndefined();
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('entity uses makeFieldKey with arguments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'Field' as const,
              name: 'posts',
              type: 'Post',
              args: {
                limit: { kind: 'literal' as const, value: 5 },
              },
              selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'posts@{"limit":5}': [{ 'title@{}': 'Post 1' }],
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          posts: [{ title: 'Post 1' }],
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'posts@{"limit":5}'],
      ]);
    });

    it('non-entity uses alias or name', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'Field' as const,
              name: 'name',
              type: 'String',
              alias: 'userName',
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          userName: 'Alice',
        },
      });
      expect(partial).toBe(false);
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });
  });

  describe('fragment masking and accessor isolation', () => {
    it('entity with only fragment spread - no accessor calls for fragment fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      // Fragment masking: only FragmentRefKey, no actual fields
      expect(data).toEqual({
        user: {
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);

      // Accessor isolation: no calls for fragment fields (name, email, etc.)
      // Only the entity link field is accessed
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('entity with direct fields + fragment spread - only direct fields tracked', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'UserDetails',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
                { kind: 'Field' as const, name: 'bio', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'bio@{}': 'Software engineer',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      // Direct fields + FragmentRefKey (fragment fields are masked)
      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);

      // Only direct fields are tracked, not fragment fields (email, bio)
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('entity with overlapping fields - direct selection tracked, not fragment', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' }, // overlapping
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);

      // name appears in both direct selection and fragment,
      // but only counted once from direct selection
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('non-entity with fragment spread - all fields tracked (no masking)', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'metadata',
          type: 'Metadata',
          selections: [
            { kind: 'Field' as const, name: 'version', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'MetadataDetails',
              selections: [
                { kind: 'Field' as const, name: 'timestamp', type: 'String' },
                { kind: 'Field' as const, name: 'author', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'metadata@{}': {
            'version@{}': '1.0',
            'timestamp@{}': 1_234_567_890,
            'author@{}': 'Jane Doe',
          },
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      // Non-entity: fragment fields are embedded (no masking)
      expect(data).toEqual({
        metadata: {
          version: '1.0',
          timestamp: 1_234_567_890,
          author: 'Jane Doe',
        },
      });
      expect(partial).toBe(false);

      // Non-entity: only the top-level field is in storage
      // Internal fields are not tracked
      expectSameCalls(calls, [[RootFieldKey, 'metadata@{}']]);
    });

    it('multiple fragments on entity - no accessor calls for any fragment fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread' as const,
              name: 'BasicInfo',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
            {
              kind: 'FragmentSpread' as const,
              name: 'ProfileInfo',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'bio', type: 'String' },
                { kind: 'Field' as const, name: 'avatar', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'bio@{}': 'Developer',
          'avatar@{}': 'avatar.png',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      // Multiple fragments: only direct fields + FragmentRefKey
      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          [FragmentRefKey]: 'User:1',
        },
      });
      expect(partial).toBe(false);

      // No fragment field tracking (name, email, bio, avatar)
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
      ]);
    });

    it('nested entity with fragment - parent and child accessor isolation', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'Field' as const,
              name: 'company',
              type: 'Company',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
                {
                  kind: 'FragmentSpread' as const,
                  name: 'CompanyDetails',
                  selections: [
                    { kind: 'Field' as const, name: '__typename', type: 'String' },
                    { kind: 'Field' as const, name: 'industry', type: 'String' },
                    { kind: 'Field' as const, name: 'founded', type: 'String' },
                  ],
                },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'company@{}': { [EntityLinkKey]: 'Company:1' },
        },
        'Company:1': {
          '__typename@{}': 'Company',
          'id@{}': '1',
          'name@{}': 'Acme Corp',
          'industry@{}': 'Tech',
          'founded@{}': 2000,
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        user: {
          __typename: 'User',
          id: '1',
          company: {
            __typename: 'Company',
            id: '1',
            name: 'Acme Corp',
            [FragmentRefKey]: 'Company:1',
          },
        },
      });
      expect(partial).toBe(false);

      // Fragment fields (industry, founded) are not tracked
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'company@{}'],
        ['Company:1', '__typename@{}'],
        ['Company:1', 'id@{}'],
        ['Company:1', 'name@{}'],
      ]);
    });

    it('entity array with fragment - no accessor calls for fragment fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread' as const,
              name: 'UserFields',
              selections: [
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
          'email@{}': 'bob@example.com',
        },
      };

      const { data, partial, calls } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        users: [
          {
            __typename: 'User',
            id: '1',
            [FragmentRefKey]: 'User:1',
          },
          {
            __typename: 'User',
            id: '2',
            [FragmentRefKey]: 'User:2',
          },
        ],
      });
      expect(partial).toBe(false);

      // Fragment fields (name, email) not tracked for either user
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
      ]);
    });
  });

  describe('fragment cache collision (#82)', () => {
    it('should not lose fields when multiple root fragments select same nested object with different sub-fields', () => {
      // query test { ...fragment1 ...fragment2 }
      // fragment fragment1 on Query { account { field1 } }
      // fragment fragment2 on Query { account { field2 } }
      const selections = [
        {
          kind: 'FragmentSpread' as const,
          name: 'fragment1',
          selections: [
            {
              kind: 'Field' as const,
              name: 'account',
              type: 'Account',
              selections: [{ kind: 'Field' as const, name: 'field1', type: 'String' }],
            },
          ],
        },
        {
          kind: 'FragmentSpread' as const,
          name: 'fragment2',
          selections: [
            {
              kind: 'Field' as const,
              name: 'account',
              type: 'Account',
              selections: [{ kind: 'Field' as const, name: 'field2', type: 'String' }],
            },
          ],
        },
      ];
      const storage = {
        [RootFieldKey]: {
          'account@{}': {
            'field1@{}': 'value1',
            'field2@{}': 'value2',
          },
        },
      };

      const { data, partial } = denormalizeTest(selections, storage);

      expect(data).toEqual({
        account: {
          field1: 'value1',
          field2: 'value2',
        },
      });
      expect(partial).toBe(false);
    });
  });
});
