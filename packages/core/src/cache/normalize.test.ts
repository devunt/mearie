import { describe, it, expect } from 'vitest';
import { normalize } from './normalize.ts';
import { RootFieldKey, EntityLinkKey } from './constants.ts';
import type { Storage, StorageKey, FieldKey } from './types.ts';
import type { SchemaMeta, Selection } from '@mearie/shared';

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
    Comment: { keyFields: ['postId', 'id'] },
    Profile: { keyFields: ['userId'] },
  },
  inputs: {},
  scalars: {},
};

const normalizeTest = (
  selections: readonly Selection[],
  data: unknown,
  variables?: Record<string, unknown>,
  storage?: Storage,
) => {
  storage ??= { [RootFieldKey]: {} };
  variables ??= {};

  const calls: [StorageKey, FieldKey][] = [];

  normalize(schema, selections, storage, data, variables, (storageKey, fieldKey) => {
    calls.push([storageKey, fieldKey]);
  });

  return { storage, calls };
};

const expectSameCalls = (actual: [StorageKey, FieldKey][], expected: [StorageKey, FieldKey][]) => {
  expect(actual).toHaveLength(expected.length);
  for (const call of expected) {
    expect(actual).toContainEqual(call);
  }
};

describe('normalize', () => {
  describe('basic fields', () => {
    it('single scalar field', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = { name: 'Alice' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'name@{}': 'Alice' },
      });
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('multiple scalar fields', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'age', type: 'Int' },
        { kind: 'Field' as const, name: 'active', type: 'Boolean' },
      ];

      const data = { name: 'Alice', age: 30, active: true };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'age@{}': 30,
          'active@{}': true,
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'age@{}'],
        [RootFieldKey, 'active@{}'],
      ]);
    });

    it('null value', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = { name: null };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'name@{}': null },
      });
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('undefined value', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = {};

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {},
      });
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

      const data = {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        },
      });
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

      const data = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'level1@{}': {
            'level2@{}': {
              'value@{}': 'deep',
            },
          },
        },
      });
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

      const data = { user: null };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'user@{}': null },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });
  });

  describe('arrays', () => {
    it('array of scalars', () => {
      const selections = [{ kind: 'Field' as const, name: 'tags', type: 'String', array: true }];

      const data = { tags: ['typescript', 'graphql', 'cache'] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'tags@{}': ['typescript', 'graphql', 'cache'] },
      });
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
            { kind: 'Field' as const, name: 'value', type: 'Int' },
          ],
        },
      ];

      const data = {
        items: [
          { name: 'Item 1', value: 100 },
          { name: 'Item 2', value: 200 },
        ],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'items@{}': [
            { 'name@{}': 'Item 1', 'value@{}': 100 },
            { 'name@{}': 'Item 2', 'value@{}': 200 },
          ],
        },
      });
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

      const data = { items: [{ name: 'Item 1' }, null, { name: 'Item 3' }] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'items@{}': [{ 'name@{}': 'Item 1' }, null, { 'name@{}': 'Item 3' }],
        },
      });
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

      const data = { items: [] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'items@{}': [] },
      });
      expectSameCalls(calls, [[RootFieldKey, 'items@{}']]);
    });

    it('nested arrays', () => {
      const selections = [{ kind: 'Field' as const, name: 'matrix', type: 'Int' }];

      const data = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'matrix@{}': [
            [1, 2],
            [3, 4],
          ],
        },
      });
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
              selections: [{ kind: 'Field' as const, name: 'values', type: 'Int', array: true }],
            },
          ],
        },
      ];

      const data = {
        data: {
          items: [{ values: [1, 2, 3] }, { values: [4, 5, 6] }],
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'data@{}': {
            'items@{}': [{ 'values@{}': [1, 2, 3] }, { 'values@{}': [4, 5, 6] }],
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'data@{}']]);
    });

    it('entity array with non-entity array fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'users',
          type: 'User',
          array: true,
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'tags', type: 'String', array: true },
          ],
        },
      ];

      const data = {
        users: [
          { __typename: 'User', id: '1', tags: ['admin', 'editor'] },
          { __typename: 'User', id: '2', tags: ['viewer'] },
        ],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'tags@{}': ['admin', 'editor'],
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'tags@{}': ['viewer'],
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'users@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'tags@{}'],
        ['User:2', '__typename@{}'],
        ['User:2', 'id@{}'],
        ['User:2', 'tags@{}'],
      ]);
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

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      });
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

      const data = {
        comment: {
          __typename: 'Comment',
          postId: 'post-1',
          id: 'comment-1',
          text: 'Great post!',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'comment@{}': { [EntityLinkKey]: 'Comment:post-1:comment-1' } },
        'Comment:post-1:comment-1': {
          '__typename@{}': 'Comment',
          'postId@{}': 'post-1',
          'id@{}': 'comment-1',
          'text@{}': 'Great post!',
        },
      });
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

      const data = {
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
        ],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
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
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
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
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bob' },
          { __typename: 'User', id: '1', name: 'Alice Updated' },
        ],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }, { [EntityLinkKey]: 'User:1' }],
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice Updated',
        },
        'User:2': {
          '__typename@{}': 'User',
          'id@{}': '2',
          'name@{}': 'Bob',
        },
      });
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

    it('entity with missing key field stores as inline object', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            '__typename@{}': 'User',
            'name@{}': 'Alice',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('entity with null key field stores as inline object', () => {
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

      const data = {
        user: {
          __typename: 'User',
          id: null,
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            '__typename@{}': 'User',
            'id@{}': null,
            'name@{}': 'Alice',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('entity with undefined key field stores as inline object', () => {
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

      const data = {
        user: {
          __typename: 'User',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            '__typename@{}': 'User',
            'name@{}': 'Alice',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('entity with partial key fields stores as inline object', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'comment',
          type: 'Comment',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'postId', type: 'ID' },
            { kind: 'Field' as const, name: 'text', type: 'String' },
          ],
        },
      ];

      const data = {
        comment: {
          __typename: 'Comment',
          postId: 'post-1',
          text: 'Great!',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'comment@{}': {
            '__typename@{}': 'Comment',
            'postId@{}': 'post-1',
            'text@{}': 'Great!',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'comment@{}']]);
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

      const data = { posts: [{ title: 'Post 1' }] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"limit":10,"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      });
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

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = { limit: 10, offset: 0 };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"limit":10,"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      });
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

      const data = {
        posts1: [{ title: 'Post 1' }],
        posts2: [{ title: 'Post 2' }],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"limit":5}': [{ 'title@{}': 'Post 1' }],
          'posts@{"limit":10}': [{ 'title@{}': 'Post 2' }],
        },
      });
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

      const data = { posts: [{ title: 'Post 1' }] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"filter":{"status":"published","tags":["typescript","graphql"]}}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'posts@{"filter":{"status":"published","tags":["typescript","graphql"]}}'],
      ]);
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

      const data = { userName: 'Alice' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'name@{}': 'Alice' },
      });
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

      const data = {
        currentUser: { __typename: 'User', id: '1', name: 'Alice' },
        otherUser: { __typename: 'User', id: '2', name: 'Bob' },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
        post: {
          writerName: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'post@{}': {
            'authorName@{}': 'Alice',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'post@{}']]);
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

      const data = { name: 'Alice', email: 'alice@example.com' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
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

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
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

      const data = {
        user: {
          name: 'Alice',
          profile: {
            bio: 'Developer',
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'profile@{}': {
              'bio@{}': 'Developer',
            },
          },
        },
      });
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

      const data = {
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'age@{}'],
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      });
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

      const data = {
        entity: {
          __typename: 'Post',
          id: '1',
          title: 'Hello',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'Post:1' } },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello',
        },
      });
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          profile: {
            bio: 'Developer',
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'profile@{}': {
            'bio@{}': 'Developer',
          },
        },
      });
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
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

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
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

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          bio: 'Developer',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'age@{}': 30,
          'bio@{}': 'Developer',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
        ['User:1', 'age@{}'],
        ['User:1', 'bio@{}'],
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

      const data = {
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
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          stats: {
            followers: 100,
            following: 50,
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
        users: [{ __typename: 'User', id: '1', name: 'Alice' }, null, { __typename: 'User', id: '2', name: 'Bob' }],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
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

      const data = {
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
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
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
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'bestFriend@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('entity with embedded non-entity containing entity reference', () => {
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
              name: 'metadata',
              type: 'Metadata',
              selections: [
                { kind: 'Field' as const, name: 'views', type: 'String' },
                {
                  kind: 'Field' as const,
                  name: 'editor',
                  type: 'User',
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

      const data = {
        post: {
          __typename: 'Post',
          id: '1',
          metadata: {
            views: 100,
            editor: {
              __typename: 'User',
              id: '5',
              name: 'Editor',
            },
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'post@{}': { [EntityLinkKey]: 'Post:1' },
        },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'metadata@{}': {
            'views@{}': 100,
            'editor@{}': { [EntityLinkKey]: 'User:5' },
          },
        },
        'User:5': {
          '__typename@{}': 'User',
          'id@{}': '5',
          'name@{}': 'Editor',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'post@{}'],
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'metadata@{}'],
        ['User:5', '__typename@{}'],
        ['User:5', 'id@{}'],
        ['User:5', 'name@{}'],
      ]);
    });

    it('deep nested non-entity objects within entity', () => {
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
              name: 'profile',
              type: 'Profile',
              selections: [
                {
                  kind: 'Field' as const,
                  name: 'settings',
                  type: 'Settings',
                  selections: [
                    {
                      kind: 'Field' as const,
                      name: 'privacy',
                      type: 'Privacy',
                      selections: [{ kind: 'Field' as const, name: 'level', type: 'String' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          profile: {
            settings: {
              privacy: {
                level: 'private',
              },
            },
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'profile@{}': {
            'settings@{}': {
              'privacy@{}': {
                'level@{}': 'private',
              },
            },
          },
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'profile@{}'],
      ]);
    });
  });

  describe('edge cases', () => {
    it('null data', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = null;

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({ [RootFieldKey]: {} });
      expectSameCalls(calls, []);
    });

    it('undefined data', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = undefined;

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({ [RootFieldKey]: {} });
      expectSameCalls(calls, []);
    });

    it('empty object data', () => {
      const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

      const data = {};

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({ [RootFieldKey]: {} });
      expectSameCalls(calls, [[RootFieldKey, 'name@{}']]);
    });

    it('empty selections', () => {
      const selections: Selection[] = [];

      const data = { name: 'Alice' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({ [RootFieldKey]: {} });
      expectSameCalls(calls, []);
    });

    it('field value is undefined in nested object', () => {
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

      const data = {
        user: {
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });
  });

  describe('falsy values', () => {
    it('should handle 0 as field value', () => {
      const selections = [
        { kind: 'Field' as const, name: 'count', type: 'String' },
        { kind: 'Field' as const, name: 'balance', type: 'String' },
      ];

      const data = { count: 0, balance: 0 };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'count@{}': 0,
          'balance@{}': 0,
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'count@{}'],
        [RootFieldKey, 'balance@{}'],
      ]);
    });

    it('should handle false as field value', () => {
      const selections = [
        { kind: 'Field' as const, name: 'active', type: 'String' },
        { kind: 'Field' as const, name: 'verified', type: 'String' },
      ];

      const data = { active: false, verified: false };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'active@{}': false,
          'verified@{}': false,
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'active@{}'],
        [RootFieldKey, 'verified@{}'],
      ]);
    });

    it('should handle empty string as field value', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        { kind: 'Field' as const, name: 'description', type: 'String' },
      ];

      const data = { name: '', description: '' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': '',
          'description@{}': '',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'description@{}'],
      ]);
    });

    it('should distinguish between null, undefined, 0, false, and empty string', () => {
      const selections = [
        { kind: 'Field' as const, name: 'nullValue', type: 'String' },
        { kind: 'Field' as const, name: 'undefinedValue', type: 'String' },
        { kind: 'Field' as const, name: 'zeroValue', type: 'String' },
        { kind: 'Field' as const, name: 'falseValue', type: 'String' },
        { kind: 'Field' as const, name: 'emptyString', type: 'String' },
      ];

      const data = {
        nullValue: null,
        zeroValue: 0,
        falseValue: false,
        emptyString: '',
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'nullValue@{}': null,
          'zeroValue@{}': 0,
          'falseValue@{}': false,
          'emptyString@{}': '',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'nullValue@{}'],
        [RootFieldKey, 'undefinedValue@{}'],
        [RootFieldKey, 'zeroValue@{}'],
        [RootFieldKey, 'falseValue@{}'],
        [RootFieldKey, 'emptyString@{}'],
      ]);
    });

    it('should handle 0 as entity key field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'item',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const data = {
        item: {
          __typename: 'User',
          id: 0,
          name: 'Zero User',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'item@{}': { [EntityLinkKey]: 'User:0' } },
        'User:0': {
          '__typename@{}': 'User',
          'id@{}': 0,
          'name@{}': 'Zero User',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'item@{}'],
        ['User:0', '__typename@{}'],
        ['User:0', 'id@{}'],
        ['User:0', 'name@{}'],
      ]);
    });

    it('should handle false as entity key field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'item',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const data = {
        item: {
          __typename: 'User',
          id: false,
          name: 'False User',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'item@{}': { [EntityLinkKey]: 'User:false' } },
        'User:false': {
          '__typename@{}': 'User',
          'id@{}': false,
          'name@{}': 'False User',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'item@{}'],
        ['User:false', '__typename@{}'],
        ['User:false', 'id@{}'],
        ['User:false', 'name@{}'],
      ]);
    });

    it('should handle empty string as entity key field', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'item',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
          ],
        },
      ];

      const data = {
        item: {
          __typename: 'User',
          id: '',
          name: 'Empty ID User',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'item@{}': { [EntityLinkKey]: 'User:' } },
        'User:': {
          '__typename@{}': 'User',
          'id@{}': '',
          'name@{}': 'Empty ID User',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'item@{}'],
        ['User:', '__typename@{}'],
        ['User:', 'id@{}'],
        ['User:', 'name@{}'],
      ]);
    });

    it('should handle falsy values in arrays', () => {
      const selections = [{ kind: 'Field' as const, name: 'values', type: 'String' }];

      const data = { values: [0, false, '', null, 1, true, 'text'] };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'values@{}': [0, false, '', null, 1, true, 'text'] },
      });
      expectSameCalls(calls, [[RootFieldKey, 'values@{}']]);
    });
  });

  describe('entity vs non-entity embedding', () => {
    it('non-entity object at root should be embedded in root', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'metadata',
          type: 'Metadata',
          selections: [
            { kind: 'Field' as const, name: 'version', type: 'String' },
            { kind: 'Field' as const, name: 'timestamp', type: 'String' },
          ],
        },
      ];

      const data = {
        metadata: {
          version: '1.0.0',
          timestamp: '2024-01-01',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'metadata@{}': {
            'version@{}': '1.0.0',
            'timestamp@{}': '2024-01-01',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'metadata@{}']]);
    });

    it('entity object at root should be normalized separately', () => {
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

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('non-entity object within entity should be embedded in entity', () => {
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
              name: 'settings',
              type: 'Settings',
              selections: [
                { kind: 'Field' as const, name: 'theme', type: 'String' },
                { kind: 'Field' as const, name: 'language', type: 'String' },
              ],
            },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          settings: {
            theme: 'dark',
            language: 'en',
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'settings@{}': {
            'theme@{}': 'dark',
            'language@{}': 'en',
          },
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'settings@{}'],
      ]);
    });

    it('entity object within entity should be normalized separately', () => {
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
                { kind: 'Field' as const, name: '__typename', type: 'String' },
                { kind: 'Field' as const, name: 'id', type: 'ID' },
                { kind: 'Field' as const, name: 'name', type: 'String' },
              ],
            },
          ],
        },
      ];

      const data = {
        post: {
          __typename: 'Post',
          id: '1',
          author: {
            __typename: 'User',
            id: '10',
            name: 'Alice',
          },
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'post@{}': { [EntityLinkKey]: 'Post:1' },
        },
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
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'post@{}'],
        ['Post:1', '__typename@{}'],
        ['Post:1', 'id@{}'],
        ['Post:1', 'author@{}'],
        ['User:10', '__typename@{}'],
        ['User:10', 'id@{}'],
        ['User:10', 'name@{}'],
      ]);
    });
  });

  describe('variable edge cases', () => {
    it('should handle undefined variable value', () => {
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

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = { limit: undefined };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'posts@{}']]);
    });

    it('should handle null variable value', () => {
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

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = { limit: null };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"limit":null}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"limit":null}']]);
    });

    it('should handle missing variable', () => {
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

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = {};

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'posts@{}']]);
    });

    it('should handle complex object variable', () => {
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

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = {
        filter: {
          status: 'published',
          tags: ['typescript', 'graphql'],
          author: { id: '123', name: 'Alice' },
        },
      };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"filter":{"author":{"id":"123","name":"Alice"},"status":"published","tags":["typescript","graphql"]}}':
            [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [
        [
          RootFieldKey,
          'posts@{"filter":{"author":{"id":"123","name":"Alice"},"status":"published","tags":["typescript","graphql"]}}',
        ],
      ]);
    });

    it('should handle array variable', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            ids: { kind: 'variable' as const, name: 'ids' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = { ids: ['1', '2', '3'] };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"ids":["1","2","3"]}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"ids":["1","2","3"]}']]);
    });

    it('should handle multiple variables with mixed types', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
            offset: { kind: 'variable' as const, name: 'offset' },
            filter: { kind: 'variable' as const, name: 'filter' },
            nullVar: { kind: 'variable' as const, name: 'nullVar' },
            undefinedVar: { kind: 'variable' as const, name: 'undefinedVar' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = {
        limit: 10,
        offset: 0,
        filter: { status: 'published' },
        nullVar: null,
        undefinedVar: undefined,
      };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"filter":{"status":"published"},"limit":10,"nullVar":null,"offset":0}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'posts@{"filter":{"status":"published"},"limit":10,"nullVar":null,"offset":0}'],
      ]);
    });

    it('should handle falsy variable values', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          args: {
            limit: { kind: 'variable' as const, name: 'limit' },
            active: { kind: 'variable' as const, name: 'active' },
            search: { kind: 'variable' as const, name: 'search' },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
      ];

      const data = { posts: [{ title: 'Post 1' }] };
      const variables = {
        limit: 0,
        active: false,
        search: '',
      };

      const { storage, calls } = normalizeTest(selections, data, variables);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"active":false,"limit":0,"search":""}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'posts@{"active":false,"limit":0,"search":""}']]);
    });
  });

  describe('storage merging', () => {
    describe('root level merging', () => {
      it('should add new root field to existing storage', () => {
        const selections1 = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
        const selections2 = [{ kind: 'Field' as const, name: 'email', type: 'String' }];

        const { storage } = normalizeTest(selections1, { name: 'Alice' });
        normalizeTest(selections2, { email: 'alice@example.com' }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        });
      });

      it('should overwrite existing root field', () => {
        const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];

        const { storage } = normalizeTest(selections, { name: 'Alice' });
        normalizeTest(selections, { name: 'Bob' }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'name@{}': 'Bob',
          },
        });
      });

      it('should merge nested objects in root fields', () => {
        const selections = [
          {
            kind: 'Field' as const,
            name: 'config',
            type: 'Config',
            selections: [
              { kind: 'Field' as const, name: 'theme', type: 'String' },
              { kind: 'Field' as const, name: 'language', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections, {
          config: { theme: 'dark', language: 'en' },
        });

        normalizeTest(selections, { config: { theme: 'light', language: 'en' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'config@{}': {
              'theme@{}': 'light',
              'language@{}': 'en',
            },
          },
        });
      });
    });

    describe('entity merging', () => {
      it('should add new field to existing entity', () => {
        const selections1 = [
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

        const selections2 = [
          {
            kind: 'Field' as const,
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'email', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections2, { user: { __typename: 'User', id: '1', email: 'alice@example.com' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        });
      });

      it('should overwrite existing field in entity', () => {
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

        const { storage } = normalizeTest(selections, {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections, { user: { __typename: 'User', id: '1', name: 'Alice Updated' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice Updated',
          },
        });
      });

      it('should add new entity to storage', () => {
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

        const { storage } = normalizeTest(selections, {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections, { user: { __typename: 'User', id: '2', name: 'Bob' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:2' } },
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
        });
      });

      it('should merge multiple entities at once', () => {
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

        const { storage } = normalizeTest(selections, {
          users: [{ __typename: 'User', id: '1', name: 'Alice' }],
        });

        normalizeTest(
          selections,
          {
            users: [
              { __typename: 'User', id: '1', name: 'Alice Updated' },
              { __typename: 'User', id: '2', name: 'Bob' },
            ],
          },
          {},
          storage,
        );

        expect(storage).toEqual({
          [RootFieldKey]: {
            'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice Updated',
          },
          'User:2': {
            '__typename@{}': 'User',
            'id@{}': '2',
            'name@{}': 'Bob',
          },
        });
      });
    });

    describe('array field merging', () => {
      it('should replace scalar array completely', () => {
        const selections = [{ kind: 'Field' as const, name: 'tags', type: 'String', array: true }];

        const { storage } = normalizeTest(selections, { tags: ['typescript', 'graphql'] });
        normalizeTest(selections, { tags: ['react', 'vue'] }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'tags@{}': ['react', 'vue'],
          },
        });
      });

      it('should replace entity array with new references', () => {
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

        const { storage } = normalizeTest(selections, {
          users: [
            { __typename: 'User', id: '1', name: 'Alice' },
            { __typename: 'User', id: '2', name: 'Bob' },
          ],
        });

        normalizeTest(
          selections,
          {
            users: [{ __typename: 'User', id: '3', name: 'Charlie' }],
          },
          {},
          storage,
        );

        expect(storage).toEqual({
          [RootFieldKey]: {
            'users@{}': [{ [EntityLinkKey]: 'User:3' }],
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
          'User:3': {
            '__typename@{}': 'User',
            'id@{}': '3',
            'name@{}': 'Charlie',
          },
        });
      });

      it('should replace non-entity object array', () => {
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

        const { storage } = normalizeTest(selections, {
          items: [
            { name: 'Item 1', value: 100 },
            { name: 'Item 2', value: 200 },
          ],
        });

        normalizeTest(selections, { items: [{ name: 'Item 3', value: 300 }] }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'items@{}': [{ 'name@{}': 'Item 3', 'value@{}': 300 }],
          },
        });
      });
    });

    describe('entity to null and null to entity', () => {
      it('should update entity to null', () => {
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

        const { storage } = normalizeTest(selections, {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections, { user: null }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'user@{}': null,
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
          },
        });
      });

      it('should update null to entity', () => {
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

        const { storage } = normalizeTest(selections, { user: null });

        normalizeTest(selections, { user: { __typename: 'User', id: '1', name: 'Alice' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'user@{}': { [EntityLinkKey]: 'User:1' },
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
          },
        });
      });

      it('should update non-entity to entity', () => {
        const selections1 = [
          {
            kind: 'Field' as const,
            name: 'item',
            type: 'Item',
            selections: [
              { kind: 'Field' as const, name: 'name', type: 'String' },
              { kind: 'Field' as const, name: 'value', type: 'String' },
            ],
          },
        ];

        const selections2 = [
          {
            kind: 'Field' as const,
            name: 'item',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'name', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          item: { name: 'Test', value: 123 },
        });

        normalizeTest(selections2, { item: { __typename: 'User', id: '1', name: 'Alice' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'item@{}': { [EntityLinkKey]: 'User:1' },
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
          },
        });
      });

      it('should update entity to non-entity', () => {
        const selections1 = [
          {
            kind: 'Field' as const,
            name: 'item',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'name', type: 'String' },
            ],
          },
        ];

        const selections2 = [
          {
            kind: 'Field' as const,
            name: 'item',
            type: 'Item',
            selections: [
              { kind: 'Field' as const, name: 'name', type: 'String' },
              { kind: 'Field' as const, name: 'value', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          item: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections2, { item: { name: 'Test', value: 123 } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'item@{}': {
              'name@{}': 'Test',
              'value@{}': 123,
            },
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
          },
        });
      });
    });

    describe('entity reference updates', () => {
      it('should update entity reference in root field', () => {
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
        ];

        const { storage } = normalizeTest(selections, {
          currentUser: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections, { currentUser: { __typename: 'User', id: '2', name: 'Bob' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'currentUser@{}': { [EntityLinkKey]: 'User:2' } },
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
        });
      });

      it('should update nested entity reference', () => {
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

        const { storage } = normalizeTest(selections, {
          post: {
            __typename: 'Post',
            id: '1',
            title: 'Post 1',
            author: { __typename: 'User', id: '1', name: 'Alice' },
          },
        });

        normalizeTest(
          selections,
          {
            post: {
              __typename: 'Post',
              id: '1',
              title: 'Post 1',
              author: { __typename: 'User', id: '2', name: 'Bob' },
            },
          },
          {},
          storage,
        );

        expect(storage).toEqual({
          [RootFieldKey]: { 'post@{}': { [EntityLinkKey]: 'Post:1' } },
          'Post:1': {
            '__typename@{}': 'Post',
            'id@{}': '1',
            'title@{}': 'Post 1',
            'author@{}': { [EntityLinkKey]: 'User:2' },
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
        });
      });
    });

    describe('complex merging scenarios', () => {
      it('should handle multiple sequential normalizations', () => {
        const { storage } = normalizeTest([{ kind: 'Field' as const, name: 'name', type: 'String' }], {
          name: 'Alice',
        });

        normalizeTest(
          [{ kind: 'Field' as const, name: 'email', type: 'String' }],
          { email: 'alice@example.com' },
          {},
          storage,
        );

        normalizeTest([{ kind: 'Field' as const, name: 'age', type: 'String' }], { age: 30 }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
            'age@{}': 30,
          },
        });
      });

      it('should merge partial entity updates across multiple normalizations', () => {
        const selections1 = [
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

        const selections2 = [
          {
            kind: 'Field' as const,
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'email', type: 'String' },
            ],
          },
        ];

        const selections3 = [
          {
            kind: 'Field' as const,
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'age', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(selections2, { user: { __typename: 'User', id: '1', email: 'alice@example.com' } }, {}, storage);

        normalizeTest(selections3, { user: { __typename: 'User', id: '1', age: 30 } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
            'age@{}': 30,
          },
        });
      });

      it('should handle mixed root and entity updates', () => {
        const selections1 = [
          { kind: 'Field' as const, name: 'title', type: 'String' },
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

        const selections2 = [
          { kind: 'Field' as const, name: 'description', type: 'String' },
          {
            kind: 'Field' as const,
            name: 'user',
            type: 'User',
            selections: [
              { kind: 'Field' as const, name: '__typename', type: 'String' },
              { kind: 'Field' as const, name: 'id', type: 'ID' },
              { kind: 'Field' as const, name: 'email', type: 'String' },
            ],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          title: 'Welcome',
          user: { __typename: 'User', id: '1', name: 'Alice' },
        });

        normalizeTest(
          selections2,
          {
            description: 'Home page',
            user: { __typename: 'User', id: '1', email: 'alice@example.com' },
          },
          {},
          storage,
        );

        expect(storage).toEqual({
          [RootFieldKey]: {
            'title@{}': 'Welcome',
            'description@{}': 'Home page',
            'user@{}': { [EntityLinkKey]: 'User:1' },
          },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        });
      });

      it('should handle arguments in field keys during merge', () => {
        const selections1 = [
          {
            kind: 'Field' as const,
            name: 'posts',
            type: 'Post',
            args: { limit: { kind: 'literal' as const, value: 5 } },
            selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
          },
        ];

        const selections2 = [
          {
            kind: 'Field' as const,
            name: 'posts',
            type: 'Post',
            args: { limit: { kind: 'literal' as const, value: 10 } },
            selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
          },
        ];

        const { storage } = normalizeTest(selections1, {
          posts: [{ title: 'Post 1' }],
        });

        normalizeTest(selections2, { posts: [{ title: 'Post 2' }] }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: {
            'posts@{"limit":5}': [{ 'title@{}': 'Post 1' }],
            'posts@{"limit":10}': [{ 'title@{}': 'Post 2' }],
          },
        });
      });

      it('should preserve unrelated fields during merge', () => {
        const selections1 = [
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

        const selections2 = [
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

        const { storage } = normalizeTest(selections1, {
          user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
        });

        normalizeTest(selections2, { user: { __typename: 'User', id: '1', name: 'Alice Updated' } }, {}, storage);

        expect(storage).toEqual({
          [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
          'User:1': {
            '__typename@{}': 'User',
            'id@{}': '1',
            'name@{}': 'Alice Updated',
            'email@{}': 'alice@example.com',
          },
        });
      });
    });
  });

  describe('fragment field duplication', () => {
    it('should handle same field in multiple fragment spreads', () => {
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
          name: 'ContactInfo',
          selections: [
            { kind: 'Field' as const, name: 'email', type: 'String' },
            { kind: 'Field' as const, name: 'phone', type: 'String' },
          ],
        },
      ];

      const data = { name: 'Alice', email: 'alice@example.com', phone: '123-456-7890' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
          'phone@{}': '123-456-7890',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'email@{}'],
        [RootFieldKey, 'phone@{}'],
      ]);
    });

    it('should handle same field in field and fragment spread', () => {
      const selections = [
        { kind: 'Field' as const, name: 'name', type: 'String' },
        {
          kind: 'FragmentSpread' as const,
          name: 'UserInfo',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'email', type: 'String' },
          ],
        },
      ];

      const data = { name: 'Alice', email: 'alice@example.com' };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'name@{}'],
        [RootFieldKey, 'email@{}'],
      ]);
    });

    it('should handle same field in inline fragment and fragment spread', () => {
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
              name: 'UserFields',
              selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
            },
            {
              kind: 'InlineFragment' as const,
              on: 'User',
              selections: [{ kind: 'Field' as const, name: 'name', type: 'String' }],
            },
          ],
        },
      ];

      const data = {
        entity: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'entity@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'entity@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'name@{}'],
      ]);
    });

    it('should handle nested fragments with duplicate fields', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field' as const, name: 'name', type: 'String' },
            {
              kind: 'FragmentSpread' as const,
              name: 'OuterFragment',
              selections: [
                { kind: 'Field' as const, name: 'email', type: 'String' },
                {
                  kind: 'FragmentSpread' as const,
                  name: 'InnerFragment',
                  selections: [
                    { kind: 'Field' as const, name: 'name', type: 'String' },
                    { kind: 'Field' as const, name: 'email', type: 'String' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const data = {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'user@{}': {
            'name@{}': 'Alice',
            'email@{}': 'alice@example.com',
          },
        },
      });
      expectSameCalls(calls, [[RootFieldKey, 'user@{}']]);
    });

    it('should handle duplicate fields with different arguments', () => {
      const selections = [
        {
          kind: 'Field' as const,
          name: 'posts',
          type: 'Post',
          alias: 'recentPosts',
          args: {
            limit: { kind: 'literal' as const, value: 5 },
          },
          selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
        },
        {
          kind: 'FragmentSpread' as const,
          name: 'AllPosts',
          selections: [
            {
              kind: 'Field' as const,
              name: 'posts',
              type: 'Post',
              alias: 'allPosts',
              args: {
                limit: { kind: 'literal' as const, value: 100 },
              },
              selections: [{ kind: 'Field' as const, name: 'title', type: 'String' }],
            },
          ],
        },
      ];

      const data = {
        recentPosts: [{ title: 'Recent 1' }],
        allPosts: [{ title: 'Post 1' }],
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'posts@{"limit":5}': [{ 'title@{}': 'Recent 1' }],
          'posts@{"limit":100}': [{ 'title@{}': 'Post 1' }],
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'posts@{"limit":5}'],
        [RootFieldKey, 'posts@{"limit":100}'],
      ]);
    });

    it('should handle entity field duplication across fragments', () => {
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
                { kind: 'Field' as const, name: 'name', type: 'String' },
                { kind: 'Field' as const, name: 'email', type: 'String' },
              ],
            },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
        },
      };

      const { storage, calls } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      });
      expectSameCalls(calls, [
        [RootFieldKey, 'user@{}'],
        ['User:1', '__typename@{}'],
        ['User:1', 'id@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'name@{}'],
        ['User:1', 'email@{}'],
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

      const data = {
        account: {
          field1: 'value1',
          field2: 'value2',
        },
      };

      const { storage } = normalizeTest(selections, data);

      expect(storage).toEqual({
        [RootFieldKey]: {
          'account@{}': {
            'field1@{}': 'value1',
            'field2@{}': 'value2',
          },
        },
      });
    });

    it('should not lose nested non-entity fields when entity has direct field and fragment selecting same nested object with different sub-fields', () => {
      // query { user { stats { fieldA } ...Fragment } }
      // fragment Fragment on User { stats { fieldA fieldB } }
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
              name: 'stats',
              type: 'Stats',
              selections: [{ kind: 'Field' as const, name: 'fieldA', type: 'Int' }],
            },
            {
              kind: 'FragmentSpread' as const,
              name: 'UserStats',
              selections: [
                {
                  kind: 'Field' as const,
                  name: 'stats',
                  type: 'Stats',
                  selections: [
                    { kind: 'Field' as const, name: 'fieldA', type: 'Int' },
                    { kind: 'Field' as const, name: 'fieldB', type: 'Int' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          id: '1',
          stats: {
            fieldA: 100,
            fieldB: 200,
          },
        },
      };

      const { storage } = normalizeTest(selections, data);

      expect(storage['User:1']).toEqual(
        expect.objectContaining({
          'stats@{}': {
            'fieldA@{}': 100,
            'fieldB@{}': 200,
          },
        }),
      );
    });
  });

  describe('aliased __typename', () => {
    it('should normalize entity correctly when __typename is aliased', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String', alias: 'myType' },
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'name', type: 'String' },
          ],
        },
      ];

      const data = {
        user: {
          myType: 'User',
          id: '1',
          name: 'Alice',
        },
      };

      const { storage } = normalizeTest(selections, data);

      expect(storage[RootFieldKey]['user@{}']).toEqual({ [EntityLinkKey]: 'User:1' });
      expect(storage['User:1']).toEqual({
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      });
    });
  });

  describe('entity with invalid keys should not overwrite existing entity link', () => {
    it('should preserve entity link when fragment re-normalizes entity without key fields', () => {
      // Previously normalized: User:1 stored as entity with valid keys
      const existingStorage: Storage = {
        [RootFieldKey]: {
          'user@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
          'email@{}': 'alice@example.com',
        },
      };

      // query { user { ...UserFragment } }
      // fragment UserFragment on User { name }
      // Response lacks 'id' field → entity key invalid
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'FragmentSpread',
              name: 'UserFragment',
              selections: [{ kind: 'Field', name: 'name', type: 'String' }],
            },
          ],
        },
      ];

      const data = {
        user: {
          __typename: 'User',
          name: 'Bob',
        },
      };

      const { storage } = normalizeTest(selections, data, {}, existingStorage);

      // Entity link must NOT be overwritten by inline object
      expect(storage[RootFieldKey]['user@{}']).toEqual({ [EntityLinkKey]: 'User:1' });
      // Entity storage must remain intact
      expect(storage['User:1']).toEqual({
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
        'email@{}': 'alice@example.com',
      });
    });

    it('should preserve nested entity link inside parent entity when fragment re-normalizes without key fields', () => {
      // Post:1 has author stored as entity link to User:1
      const existingStorage: Storage = {
        [RootFieldKey]: {
          'post@{}': { [EntityLinkKey]: 'Post:1' },
        },
        'Post:1': {
          '__typename@{}': 'Post',
          'id@{}': '1',
          'title@{}': 'Hello',
          'author@{}': { [EntityLinkKey]: 'User:1' },
        },
        'User:1': {
          '__typename@{}': 'User',
          'id@{}': '1',
          'name@{}': 'Alice',
        },
      };

      // query { post { id ...PostFragment } }
      // fragment PostFragment on Post { author { name } }
      // Response has author without 'id' → User key invalid
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'PostFragment',
              selections: [
                {
                  kind: 'Field',
                  name: 'author',
                  type: 'User',
                  selections: [{ kind: 'Field', name: 'name', type: 'String' }],
                },
              ],
            },
          ],
        },
      ];

      const data = {
        post: {
          __typename: 'Post',
          id: '1',
          author: {
            __typename: 'User',
            name: 'Bob',
          },
        },
      };

      const { storage } = normalizeTest(selections, data, {}, existingStorage);

      // Post:1.author should remain as entity link, not overwritten by inline object
      expect(storage['Post:1']!['author@{}']).toEqual({ [EntityLinkKey]: 'User:1' });
      // User:1 entity storage should remain intact
      expect(storage['User:1']).toEqual({
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      });
    });
  });
});
