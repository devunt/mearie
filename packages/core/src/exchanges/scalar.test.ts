import { describe, it, expect } from 'vitest';
import { scalarExchange } from './scalar.ts';
import { makeTestOperation, makeTestForward, testExchange, makeTestClient } from './test-utils.ts';
import type { ScalarsConfig } from '../scalars.ts';
import type { Client } from '../client.ts';
import type { SchemaMeta, Selection } from '@mearie/shared';
import type { Operation, RequestOperation } from '../exchange.ts';
import { GraphQLError } from '../errors.ts';

const scalars: ScalarsConfig = {
  DateTime: {
    parse: (value: unknown) => new Date(value as string),
    serialize: (value: unknown) => (value as Date).toISOString(),
  },
  JSON: {
    parse: (value: unknown) => JSON.parse(value as string) as unknown,
    serialize: (value: unknown) => JSON.stringify(value),
  },
};

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
  },
  inputs: {
    CreatePostInput: {
      fields: [
        { name: 'title', type: 'String' },
        { name: 'createdAt', type: 'DateTime' },
      ],
    },
  },
  scalars: {},
};

const client = makeTestClient({ schema, scalars });

describe('scalarExchange', () => {
  describe('serialization', () => {
    it('should serialize variables before forwarding', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op = makeTestOperation({
        name: 'CreatePost',
        kind: 'mutation',
        variables: { createdAt: new Date('2025-01-15T10:00:00Z'), title: 'Test' },
        variableDefs: [
          { name: 'createdAt', type: 'DateTime' },
          { name: 'title', type: 'String' },
        ],
      });

      await testExchange(exchange, forward, [op], client);

      expect(forwardedOps).toHaveLength(1);
      expect((forwardedOps[0] as RequestOperation).variables).toEqual({
        createdAt: '2025-01-15T10:00:00.000Z',
        title: 'Test',
      });
    });

    it('should serialize array variables', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op = makeTestOperation({
        name: 'UpdateDates',
        kind: 'mutation',
        variables: {
          dates: [new Date('2025-01-15T10:00:00Z'), new Date('2025-01-16T10:00:00Z')],
        },
        variableDefs: [{ name: 'dates', type: 'DateTime', array: true }],
      });

      await testExchange(exchange, forward, [op], client);

      expect((forwardedOps[0] as RequestOperation).variables).toEqual({
        dates: ['2025-01-15T10:00:00.000Z', '2025-01-16T10:00:00.000Z'],
      });
    });

    it('should handle null variable values', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op = makeTestOperation({
        name: 'CreatePost',
        kind: 'mutation',
        variables: { createdAt: null },
        variableDefs: [{ name: 'createdAt', type: 'DateTime', nullable: true }],
      });

      await testExchange(exchange, forward, [op], client);

      expect((forwardedOps[0] as RequestOperation).variables).toEqual({ createdAt: null });
    });
  });

  describe('parsing', () => {
    it('should parse response data', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { createdAt: '2025-01-15T10:00:00Z', title: 'Test' },
        };
      });

      const selections: Selection[] = [
        { kind: 'Field', name: 'createdAt', type: 'DateTime' },
        { kind: 'Field', name: 'title', type: 'String' },
      ];

      const op = makeTestOperation({
        name: 'GetPost',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({
        createdAt: new Date('2025-01-15T10:00:00Z'),
        title: 'Test',
      });
    });

    it('should parse array of scalars in response', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { dates: ['2025-01-15T10:00:00Z', '2025-01-16T10:00:00Z'] },
        };
      });

      const selections: Selection[] = [{ kind: 'Field', name: 'dates', type: 'DateTime', array: true }];

      const op = makeTestOperation({
        name: 'GetDates',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        dates: [new Date('2025-01-15T10:00:00Z'), new Date('2025-01-16T10:00:00Z')],
      });
    });

    it('should handle null response values', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { createdAt: null, title: 'Test' },
        };
      });

      const selections: Selection[] = [
        { kind: 'Field', name: 'createdAt', type: 'DateTime' },
        { kind: 'Field', name: 'title', type: 'String' },
      ];

      const op = makeTestOperation({
        name: 'GetPost',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        createdAt: null,
        title: 'Test',
      });
    });

    it('should parse nested objects', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: {
            post: {
              createdAt: '2025-01-15T10:00:00Z',
              title: 'Test',
            },
          },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field', name: 'createdAt', type: 'DateTime' },
            { kind: 'Field', name: 'title', type: 'String' },
          ],
        },
      ];

      const op = makeTestOperation({
        name: 'GetPost',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        post: {
          createdAt: new Date('2025-01-15T10:00:00Z'),
          title: 'Test',
        },
      });
    });

    it('should not parse when data is undefined', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: undefined,
        };
      });

      const selections: Selection[] = [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }];

      const op = makeTestOperation({
        name: 'GetPost',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toBeUndefined();
    });
  });

  describe('no scalars config', () => {
    it('should pass through operations unchanged when no scalars config', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return {
          operation: op,
          data: { createdAt: '2025-01-15T10:00:00Z' },
        };
      });

      const op = makeTestOperation({
        name: 'GetPost',
        variables: { createdAt: new Date('2025-01-15T10:00:00Z') },
        selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
      });

      const client = { scalars: undefined } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect((forwardedOps[0] as RequestOperation).variables).toEqual({
        createdAt: new Date('2025-01-15T10:00:00Z'),
      });
      expect(results[0]!.data).toEqual({ createdAt: '2025-01-15T10:00:00Z' });
    });
  });

  describe('teardown operations', () => {
    it('should pass through teardown operations unchanged', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op = makeTestOperation({ variant: 'teardown' });

      const client = { scalars } as unknown as Client;
      await testExchange(exchange, forward, [op], client);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]!.variant).toBe('teardown');
    });
  });

  describe('integration', () => {
    it('should handle both serialization and parsing in one operation', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return {
          operation: op,
          data: {
            createPost: {
              id: '1',
              createdAt: '2025-01-15T10:00:00Z',
              metadata: '{"foo":"bar"}',
            },
          },
        };
      });

      const op = makeTestOperation({
        name: 'CreatePost',
        kind: 'mutation',
        variables: {
          createdAt: new Date('2025-01-15T10:00:00Z'),
          metadata: { foo: 'bar' },
        },
        variableDefs: [
          { name: 'createdAt', type: 'DateTime' },
          { name: 'metadata', type: 'JSON' },
        ],
        selections: [
          {
            kind: 'Field',
            name: 'createPost',
            type: 'Post',
            selections: [
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'createdAt', type: 'DateTime' },
              { kind: 'Field', name: 'metadata', type: 'JSON' },
            ],
          },
        ],
      });

      const results = await testExchange(exchange, forward, [op], client);

      expect((forwardedOps[0] as RequestOperation).variables).toEqual({
        createdAt: '2025-01-15T10:00:00.000Z',
        metadata: '{"foo":"bar"}',
      });

      expect(results[0]!.data).toEqual({
        createPost: {
          id: '1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          metadata: { foo: 'bar' },
        },
      });
    });
  });

  describe('edge cases and uncommon scenarios', () => {
    it('should handle array of objects with nested scalars', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: {
            posts: [
              { id: '1', createdAt: '2025-01-15T10:00:00Z', author: { joinedAt: '2024-01-01T10:00:00Z' } },
              { id: '2', createdAt: '2025-01-16T10:00:00Z', author: { joinedAt: '2024-02-01T10:00:00Z' } },
            ],
          },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'createdAt', type: 'DateTime' },
            {
              kind: 'Field',
              name: 'author',
              type: 'Author',
              selections: [{ kind: 'Field', name: 'joinedAt', type: 'DateTime' }],
            },
          ],
        },
      ];

      const op = makeTestOperation({ name: 'GetPosts', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        posts: [
          {
            id: '1',
            createdAt: new Date('2025-01-15T10:00:00Z'),
            author: { joinedAt: new Date('2024-01-01T10:00:00Z') },
          },
          {
            id: '2',
            createdAt: new Date('2025-01-16T10:00:00Z'),
            author: { joinedAt: new Date('2024-02-01T10:00:00Z') },
          },
        ],
      });
    });

    it('should handle deeply nested scalars', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    createdAt: '2025-01-15T10:00:00Z',
                  },
                },
              },
            },
          },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'level1',
          type: 'Level1',
          selections: [
            {
              kind: 'Field',
              name: 'level2',
              type: 'Level2',
              selections: [
                {
                  kind: 'Field',
                  name: 'level3',
                  type: 'Level3',
                  selections: [
                    {
                      kind: 'Field',
                      name: 'level4',
                      type: 'Level4',
                      selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const op = makeTestOperation({ name: 'GetDeepNested', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        level1: {
          level2: {
            level3: {
              level4: {
                createdAt: new Date('2025-01-15T10:00:00Z'),
              },
            },
          },
        },
      });
    });

    it('should handle union types with inline fragments', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: {
            search: [
              { __typename: 'Post', createdAt: '2025-01-15T10:00:00Z' },
              { __typename: 'User', joinedAt: '2024-01-01T10:00:00Z' },
            ],
          },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'search',
          type: 'SearchResult',
          array: true,
          selections: [
            { kind: 'Field', name: '__typename', type: 'String' },
            {
              kind: 'InlineFragment',
              on: 'Post',
              selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
            },
            {
              kind: 'InlineFragment',
              on: 'User',
              selections: [{ kind: 'Field', name: 'joinedAt', type: 'DateTime' }],
            },
          ],
        },
      ];

      const op = makeTestOperation({ name: 'Search', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        search: [
          { __typename: 'Post', createdAt: new Date('2025-01-15T10:00:00Z') },
          { __typename: 'User', joinedAt: new Date('2024-01-01T10:00:00Z') },
        ],
      });
    });

    it('should handle large arrays efficiently', async () => {
      const exchange = scalarExchange();
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        createdAt: '2025-01-15T10:00:00Z',
      }));

      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { posts: largeArray },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [
            { kind: 'Field', name: 'id', type: 'ID' },
            { kind: 'Field', name: 'createdAt', type: 'DateTime' },
          ],
        },
      ];

      const op = makeTestOperation({ name: 'GetManyPosts', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      const data = results[0]!.data as { posts: { id: string; createdAt: Date }[] };
      expect(Array.isArray(data.posts)).toBe(true);
      expect(data.posts).toHaveLength(1000);
      expect(data.posts[0]!.createdAt).toBeInstanceOf(Date);
    });

    it('should handle empty arrays in response', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { posts: [] },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'posts',
          type: 'Post',
          array: true,
          selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
        },
      ];

      const op = makeTestOperation({ name: 'GetPosts', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({ posts: [] });
    });

    it('should handle multiple fragment spreads', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: {
            post: {
              id: '1',
              createdAt: '2025-01-15T10:00:00Z',
              updatedAt: '2025-01-16T10:00:00Z',
            },
          },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'FragmentSpread',
              name: 'Timestamps',
              selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
            },
            {
              kind: 'FragmentSpread',
              name: 'UpdateInfo',
              selections: [{ kind: 'Field', name: 'updatedAt', type: 'DateTime' }],
            },
          ],
        },
      ];

      const op = makeTestOperation({ name: 'GetPost', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        post: {
          id: '1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          updatedAt: new Date('2025-01-16T10:00:00Z'),
        },
      });
    });

    it('should handle error responses with partial data', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { post: { createdAt: '2025-01-15T10:00:00Z' } },
          errors: [new GraphQLError('Some field failed')],
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'post',
          type: 'Post',
          selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
        },
      ];

      const op = makeTestOperation({ name: 'GetPost', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        post: { createdAt: new Date('2025-01-15T10:00:00Z') },
      });
      expect(results[0]!.errors).toHaveLength(1);
    });

    it('should serialize complex input objects', async () => {
      const exchange = scalarExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { success: true } };
      });

      const op = makeTestOperation({
        name: 'CreatePost',
        kind: 'mutation',
        variables: {
          input: { title: 'Test' },
          dates: [new Date('2025-01-15T10:00:00Z'), new Date('2025-01-16T10:00:00Z')],
          metadata: { tags: ['test', 'demo'] },
        },
        variableDefs: [
          { name: 'input', type: 'CreatePostInput' },
          { name: 'dates', type: 'DateTime', array: true },
          { name: 'metadata', type: 'JSON' },
        ],
      });

      await testExchange(exchange, forward, [op], client);

      expect((forwardedOps[0] as RequestOperation).variables).toEqual({
        input: { title: 'Test' },
        dates: ['2025-01-15T10:00:00.000Z', '2025-01-16T10:00:00.000Z'],
        metadata: '{"tags":["test","demo"]}',
      });
    });

    it('should handle subscription operations', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { messageAdded: { createdAt: '2025-01-15T10:00:00Z', content: 'Hello' } },
        };
      });

      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'messageAdded',
          type: 'Message',
          selections: [
            { kind: 'Field', name: 'createdAt', type: 'DateTime' },
            { kind: 'Field', name: 'content', type: 'String' },
          ],
        },
      ];

      const op = makeTestOperation({
        name: 'OnMessageAdded',
        kind: 'subscription',
        selections,
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.data).toEqual({
        messageAdded: {
          createdAt: new Date('2025-01-15T10:00:00Z'),
          content: 'Hello',
        },
      });
    });

    it('should preserve extensions in results', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          data: { test: '2025-01-15T10:00:00Z' },
          extensions: { tracing: { duration: 123 } },
        };
      });

      const selections: Selection[] = [{ kind: 'Field', name: 'test', type: 'DateTime' }];

      const op = makeTestOperation({ name: 'Test', selections });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op], client);

      expect(results[0]!.extensions).toEqual({ tracing: { duration: 123 } });
    });

    it('should handle concurrent operations with different scalars', async () => {
      const exchange = scalarExchange();
      const forward = makeTestForward((op) => {
        if (op.variant === 'request' && (op as RequestOperation).artifact.name === 'GetDates') {
          return { operation: op, data: { dates: ['2025-01-15T10:00:00Z'] } };
        }
        return { operation: op, data: { metadata: '{"key":"value"}' } };
      });

      const op1 = makeTestOperation({
        name: 'GetDates',
        selections: [{ kind: 'Field', name: 'dates', type: 'DateTime', array: true }],
      });

      const op2 = makeTestOperation({
        name: 'GetMetadata',
        selections: [{ kind: 'Field', name: 'metadata', type: 'JSON' }],
      });

      const client = { scalars } as unknown as Client;
      const results = await testExchange(exchange, forward, [op1, op2], client);

      expect(results).toHaveLength(2);
      expect(results[0]!.data).toEqual({ dates: [new Date('2025-01-15T10:00:00Z')] });
      expect(results[1]!.data).toEqual({ metadata: { key: 'value' } });
    });
  });
});
