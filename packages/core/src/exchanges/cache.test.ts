import { describe, it, expect, vi } from 'vitest';
import { cacheExchange } from './cache.ts';
import { makeTestOperation, makeTestForward, testExchange, makeTestClient } from './test-utils.ts';
import type { SchemaMeta, Artifact, FragmentRefs } from '@mearie/shared';
import type { Operation, RequestOperation, Exchange, ExchangeIO, OperationResult } from '../exchange.ts';
import { Client } from '../client.ts';
import { pipe } from '../stream/pipe.ts';
import { subscribe } from '../stream/sinks/subscribe.ts';
import { peek } from '../stream/sinks/peek.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';
import { map } from '../stream/operators/map.ts';
import { filter } from '../stream/operators/filter.ts';
import { share } from '../stream/operators/share.ts';
import { initialize } from '../stream/operators/initialize.ts';
import { finalize } from '../stream/operators/finalize.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromPromise } from '../stream/sources/from-promise.ts';
import type { Source } from '../stream/types.ts';
import { fromValue } from '../stream/index.ts';

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
  },
  inputs: {},
  scalars: {},
};

const client = makeTestClient({ schema });

describe('cacheExchange', () => {
  describe('fetch policies', () => {
    describe('cache-first', () => {
      it('should return cached data if available', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { user: { id: '1', name: 'Alice' } },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetUser' });

        const results1 = await testExchange(exchange, forward, [operation], client);
        const results2 = await testExchange(exchange, forward, [operation], client);

        expect(results1).toHaveLength(1);
        expect(results2).toHaveLength(1);
      });

      it('should forward to network if cache miss', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test', type: 'Boolean' }],
        });

        await testExchange(exchange, forward, [operation], client);

        expect(forwardedOps.length).toBeGreaterThan(0);
      });

      it('should not forward if cache hit', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation], client);
        forwardedOps.length = 0;

        await testExchange(exchange, forward, [operation], client);

        expect(forwardedOps).toHaveLength(0);
      });
    });

    describe('cache-and-network', () => {
      it('should return cached data immediately', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test', type: 'Boolean' }],
        });

        const results1 = await testExchange(exchange, forward, [operation], client);
        const results2 = await testExchange(exchange, forward, [operation], client);

        expect(results1).toHaveLength(1);
        expect(results2.length).toBeGreaterThan(0);
      });

      it('should forward to network always', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation], client);
        const count1 = forwardedOps.length;
        await testExchange(exchange, forward, [operation], client);
        const count2 = forwardedOps.length;

        expect(count2).toBeGreaterThan(count1);
      });

      it('should emit cache data then network data', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { network: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation], client);
        const results = await testExchange(exchange, forward, [operation], client);

        expect(results.length).toBeGreaterThan(0);
      });
    });

    describe('network-only', () => {
      it('should always forward to network', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation], client);
        const count1 = forwardedOps.length;
        await testExchange(exchange, forward, [operation], client);
        const count2 = forwardedOps.length;

        expect(count2).toBeGreaterThan(count1);
      });

      it('should not read from cache', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { network: true },
        }));
        const operation = makeTestOperation({ kind: 'query' });

        const results = await testExchange(exchange, forward, [operation], client);

        expect(results).toHaveLength(1);
        expect(results[0]!.data).toEqual({ network: true });
      });

      it('should write network response to cache', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        const results = await testExchange(exchange, forward, [operation], client);

        expect(results).toHaveLength(1);
        expect(results[0]!.data).toEqual({ test: true });
      });
    });

    describe('cache-only', () => {
      it('should return cached data only', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'cache-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation], client);

        const forwardedOps: Operation[] = [];
        const forward2 = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op };
        });
        const exchange2 = cacheExchange({ fetchPolicy: 'cache-only' });
        await testExchange(exchange2, forward2, [operation], client);

        expect(forwardedOps).toHaveLength(0);
      });

      it('should not forward to network', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ fetchPolicy: 'cache-only' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query' });

        await testExchange(exchange, forward, [operation], client);

        expect(forwardedOps).toHaveLength(0);
      });

      it('should return null if cache miss', async () => {
        const exchange = cacheExchange({ fetchPolicy: 'cache-only' });
        const forward = makeTestForward();
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test', type: 'Boolean' }],
        });

        const results = await testExchange(exchange, forward, [operation], client);

        expect(results[0]!.data).toBeNull();
      });
    });
  });

  describe('query operations', () => {
    it('should read query from cache', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

      await testExchange(exchange, forward, [operation], client);
      const results = await testExchange(exchange, forward, [operation], client);

      expect(results[0]!.data).toBeDefined();
    });

    it('should subscribe to query updates', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { count: 1 },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetCount' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });

    it('should write query result to cache', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toBeDefined();
    });

    it('should handle cache misses', async () => {
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });
  });

  describe('fragment operations', () => {
    it('should read fragment from cache', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragment: { ref: fragmentRef } },
      });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });

    it('should subscribe to fragment updates', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragment: { ref: fragmentRef } },
      });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });

    it('should require fragment.ref in metadata', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results[0]!.errors).toBeDefined();
    });

    it('should error if fragment.ref missing', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results[0]!.errors).toHaveLength(1);
      expect(results[0]!.errors![0]!.message).toContain('fragment.ref');
    });
  });

  describe('fragment array operations', () => {
    it('should read fragment array from cache', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request' || op.artifact?.kind !== 'query') return { operation: op };
        return {
          operation: op,
          data: {
            users: [
              { __typename: 'User', id: '1', name: 'Alice' },
              { __typename: 'User', id: '2', name: 'Bob' },
            ],
          },
        };
      });

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUsers',
        key: 'query-1',
        selections: [
          {
            kind: 'Field',
            name: 'users',
            type: 'User',
            array: true,
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'fragment-1',
        metadata: { fragment: { ref: [{ __fragmentRef: 'User:1' }, { __fragmentRef: 'User:2' }] } },
        selections: fragmentSelections,
      });

      const results = await testExchange(exchange, forward, [queryOp, fragmentOp], client);

      const fragmentResult = results.find((r) => r.operation.key === 'fragment-1');
      expect(fragmentResult).toBeDefined();
      expect(fragmentResult!.data).toEqual([
        { __typename: 'User', id: '1', name: 'Alice' },
        { __typename: 'User', id: '2', name: 'Bob' },
      ]);
    });

    it('should re-notify fragment array subscription when mutation updates an entity field', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };

        if (op.artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              users: [
                { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
                { __typename: 'User', id: '2', name: 'Bob', email: 'bob@example.com' },
              ],
            },
          };
        } else if (op.artifact?.kind === 'mutation') {
          return {
            operation: op,
            data: { updateUser: { __typename: 'User', id: '1', email: 'alice-new@example.com' } },
          };
        }
        return { operation: op };
      });

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'email', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUsers',
        key: 'query-1',
        selections: [
          {
            kind: 'Field',
            name: 'users',
            type: 'User',
            array: true,
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'fragment-1',
        metadata: { fragment: { ref: [{ __fragmentRef: 'User:1' }, { __fragmentRef: 'User:2' }] } },
        selections: fragmentSelections,
      });

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        key: 'mutation-1',
        selections: [
          {
            kind: 'Field',
            name: 'updateUser',
            type: 'User',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'email', type: 'String' },
            ],
          },
        ],
      });

      const results = await testExchange(exchange, forward, [queryOp, fragmentOp, mutationOp], client);

      const fragmentResults = results.filter((r) => r.operation.key === 'fragment-1');
      expect(fragmentResults.length).toBeGreaterThanOrEqual(2);
      expect(fragmentResults[0]!.data).toEqual([
        { __typename: 'User', id: '1', email: 'alice@example.com' },
        { __typename: 'User', id: '2', email: 'bob@example.com' },
      ]);
      const patches = fragmentResults[1]!.metadata?.cache?.patches;
      expect(patches).toBeDefined();
      expect(patches).toEqual([{ type: 'set', path: [0, 'email'], value: 'alice-new@example.com' }]);
    });
  });

  describe('mutation operations', () => {
    it('should forward mutations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { success: true } };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation], client);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should write mutation result to cache', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { createUser: { id: '1', name: 'Alice' } },
      }));
      const operation = makeTestOperation({ kind: 'mutation' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ createUser: { id: '1', name: 'Alice' } });
    });

    it('should not read from cache for mutations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation], client);
      await testExchange(exchange, forward, [operation], client);

      expect(forwardedOps).toHaveLength(2);
    });
  });

  describe('subscription operations', () => {
    it('should forward subscriptions', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation], client);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should write subscription data to cache', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { message: 'Hello' },
      }));
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ message: 'Hello' });
    });
  });

  describe('teardown handling', () => {
    it('should stop cache subscription on teardown', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query', key: 'test-1' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'test-1' });

      const results = await testExchange(exchange, forward, [operation, teardown], client);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should forward teardown operations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      await testExchange(exchange, forward, [operation], client);

      expect(forwardedOps).toHaveLength(1);
    });
  });

  describe('cache updates', () => {
    it('should emit new data when cache updates', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { count: 1 },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetCount' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });

    it('should update all subscribers of same query', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const op1 = makeTestOperation({ kind: 'query', name: 'GetData', variables: {} });
      const op2 = makeTestOperation({ kind: 'query', name: 'GetData', variables: {} });

      const results = await testExchange(exchange, forward, [op1, op2], client);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should update fragment subscribers when entity changes', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { user: { id: '1', name: 'Alice' } },
      }));
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const fragment = makeTestOperation({ kind: 'fragment', metadata: { fragmentRef } });
      const query = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [fragment, query], client);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should re-notify query subscription when mutation updates entity field', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') {
          return { operation: op };
        }

        if (op.artifact?.kind === 'query') {
          return {
            operation: op,
            data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
          };
        } else if (op.artifact?.kind === 'mutation') {
          return {
            operation: op,
            data: { updateUser: { __typename: 'User', id: '1', name: 'Bob' } },
          };
        }
        return { operation: op };
      });

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'query-1',
        selections: [
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
        ],
      });

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        key: 'mutation-1',
        selections: [
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
        ],
      });

      const results = await testExchange(exchange, forward, [queryOp, mutationOp], client);

      expect(results).toHaveLength(3);
      expect(results[0]!.data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Alice' },
      });
      expect(results[1]!.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Bob',
      });
      expect(results[2]!.data).toEqual({
        updateUser: { __typename: 'User', id: '1', name: 'Bob' },
      });
    });

    it('should re-notify fragment subscription when mutation updates entity field', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') {
          return { operation: op };
        }

        if (op.artifact?.kind === 'query') {
          return {
            operation: op,
            data: { user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' } },
          };
        } else if (op.artifact?.kind === 'mutation') {
          return {
            operation: op,
            data: { updateUser: { __typename: 'User', id: '1', email: 'bob@example.com' } },
          };
        }
        return { operation: op };
      });

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'query-1',
        selections: [
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
        ],
      });

      const fragmentRef = { __fragmentRef: 'User:1' };
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'fragment-1',
        metadata: { fragment: { ref: fragmentRef } },
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'email', type: 'String' },
        ],
      });

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        key: 'mutation-1',
        selections: [
          {
            kind: 'Field',
            name: 'updateUser',
            type: 'User',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'email', type: 'String' },
            ],
          },
        ],
      });

      const results = await testExchange(exchange, forward, [queryOp, fragmentOp, mutationOp], client);

      expect(results).toHaveLength(5);
      expect(results[0]!.data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Alice', email: 'alice@example.com' },
      });
      expect(results[1]!.data).toEqual({
        __typename: 'User',
        id: '1',
        email: 'alice@example.com',
      });
      expect(results[2]!.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'email'],
        value: 'bob@example.com',
      });
      expect(results[3]!.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['email'],
        value: 'bob@example.com',
      });
      expect(results[4]!.data).toEqual({
        updateUser: { __typename: 'User', id: '1', email: 'bob@example.com' },
      });
    });
  });

  describe('invalidation refetch', () => {
    it('should refetch query after cache invalidation', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            callCount++;
            return {
              operation: op,
              data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
            } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'q1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCount).toBe(1);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(callCount).toBe(2);

      sub();
      vi.useRealTimers();
    });

    it('should refetch query for fragment-only selections after entity invalidation', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            callCount++;
            return {
              operation: op,
              data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
            } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'q1',
        selections: [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: fragmentSelections,
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f1',
        metadata: { fragment: { ref: { __fragmentRef: 'User:1' } } },
        selections: fragmentSelections,
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      subject.next(fragmentOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      const beforeInvalidation = results.find((r) => r.operation.key === 'f1');
      expect(callCount).toBe(1);
      expect(beforeInvalidation!.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const fragmentResults = results.filter((r) => r.operation.key === 'f1');
      expect(callCount).toBe(2);
      const lastFragment = fragmentResults.at(-1)!;
      expect(lastFragment.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['name'],
        value: 'Bob',
      });

      sub();
      vi.useRealTimers();
    });

    it('should keep stale fragment data until query refetch after entity field invalidation', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            callCount++;
            return {
              operation: op,
              data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
            } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'q2',
        selections: [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: fragmentSelections,
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f2',
        metadata: { fragment: { ref: { __fragmentRef: 'User:1' } } },
        selections: fragmentSelections,
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      subject.next(fragmentOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCount).toBe(1);

      result.extension.invalidate({ __typename: 'User', id: '1', field: 'name' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const fragmentResults = results.filter((r) => r.operation.key === 'f2');
      expect(callCount).toBe(2);
      const lastF2 = fragmentResults.at(-1)!;
      expect(lastF2.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['name'],
        value: 'Bob',
      });

      sub();
      vi.useRealTimers();
    });

    it('should not refetch unrelated queries when invalidating a specific field', async () => {
      vi.useFakeTimers();

      const callCounts = { qName: 0, qEmail: 0 };
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            if (op.key === 'qName') {
              callCounts.qName++;
              return {
                operation: op,
                data: {
                  user: {
                    __typename: 'User',
                    id: '1',
                    name: callCounts.qName === 1 ? 'Alice' : 'Bob',
                  },
                },
              } as OperationResult;
            }

            if (op.key === 'qEmail') {
              callCounts.qEmail++;
              return {
                operation: op,
                data: {
                  user: {
                    __typename: 'User',
                    id: '1',
                    email: callCounts.qEmail === 1 ? 'alice@example.com' : 'bob@example.com',
                  },
                },
              } as OperationResult;
            }

            return { operation: op } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const sub = pipe(subject.source, result.io, subscribe({ next: () => {} }));

      const nameQuery = makeTestOperation({
        kind: 'query',
        name: 'GetUserName',
        key: 'qName',
        selections: [
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
        ],
      });

      const emailQuery = makeTestOperation({
        kind: 'query',
        name: 'GetUserEmail',
        key: 'qEmail',
        selections: [
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
        ],
      });

      subject.next(nameQuery);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      subject.next(emailQuery);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCounts).toEqual({ qName: 1, qEmail: 1 });

      result.extension.invalidate({ __typename: 'User', id: '1', field: 'name' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(callCounts).toEqual({ qName: 2, qEmail: 1 });

      sub();
      vi.useRealTimers();
    });

    it('should keep stale fragment data when fragment re-subscribes during invalidation refetch', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op): op is Operation & { variant: 'request' } => op.variant === 'request'),
          mergeMap((op) => {
            callCount++;

            return fromPromise(
              (async () => {
                if (callCount > 1) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                  });
                }

                return {
                  operation: op,
                  data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
                } as OperationResult;
              })(),
            );
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'q3',
        selections: [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: fragmentSelections,
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f3',
        metadata: { fragment: { ref: { __fragmentRef: 'User:1' } } },
        selections: fragmentSelections,
      });

      const fragmentResubscribeOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f4',
        metadata: { fragment: { ref: { __fragmentRef: 'User:1' } } },
        selections: fragmentSelections,
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      subject.next(fragmentOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      result.extension.invalidate({ __typename: 'User', id: '1', field: 'name' });
      subject.next(fragmentResubscribeOp);
      await Promise.resolve();

      const resubscribeResultsBeforeRefetch = results.filter((r) => r.operation.key === 'f4');
      expect(resubscribeResultsBeforeRefetch.length).toBeGreaterThanOrEqual(1);
      expect(resubscribeResultsBeforeRefetch[0]!.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });

      await vi.runAllTimersAsync();
      await Promise.resolve();

      const resubscribeResults = results.filter((r) => r.operation.key === 'f4');
      const lastF4 = resubscribeResults.at(-1)!;
      expect(lastF4.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['name'],
        value: 'Bob',
      });

      sub();
      vi.useRealTimers();
    });
  });

  describe('stale flag handling', () => {
    it('should emit stale: true after invalidation and clear stale after refetch', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op): op is Operation & { variant: 'request' } => op.variant === 'request'),
          mergeMap((op) => {
            callCount++;
            return fromPromise(
              (async () => {
                if (callCount > 1) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                  });
                }
                return {
                  operation: op,
                  data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
                } as OperationResult;
              })(),
            );
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'StaleGetUser',
        key: 'stale-q1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCount).toBe(1);
      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
      expect(results[0]!.metadata?.cache?.stale).toBeFalsy();

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await Promise.resolve();
      await Promise.resolve();

      const staleResult = results.find((r) => r.metadata?.cache?.stale === true);
      expect(staleResult).toBeDefined();
      expect(staleResult!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(callCount).toBe(2);

      const freshResult = results.at(-1)!;
      expect(freshResult.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Bob',
      });
      expect(freshResult.metadata?.cache?.stale).toBeFalsy();

      sub();
      vi.useRealTimers();
    });

    it('should emit stale: true under cache-only with data present', async () => {
      vi.useFakeTimers();

      let networkCallCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-only' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            networkCallCount++;
            return {
              operation: op,
              data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
            } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'StaleCacheOnlyUser',
        key: 'stale-co-q1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();

      const networkCountAfterInit = networkCallCount;

      const dataResults = results.filter((r) => r.data != null && (r.data as Record<string, unknown>).user != null);
      expect(dataResults.length).toBeGreaterThanOrEqual(1);

      results.length = 0;

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const staleResult = results.find((r) => r.metadata?.cache?.stale === true);
      expect(staleResult).toBeDefined();
      expect(staleResult!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      const networkCallsDuringInvalidation = networkCallCount - networkCountAfterInit;
      expect(networkCallsDuringInvalidation).toBeLessThanOrEqual(1);

      sub();
      vi.useRealTimers();
    });

    it('should emit stale: true from cache then fresh data from network under cache-and-network', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-and-network' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          map((op) => {
            callCount++;
            return {
              operation: op,
              data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
            } as OperationResult;
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'StaleCNGetUser',
        key: 'stale-cn-q1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCount).toBe(1);
      expect(results.length).toBeGreaterThanOrEqual(1);

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const staleResults = results.filter((r) => r.metadata?.cache?.stale === true);
      expect(staleResults.length).toBeGreaterThanOrEqual(1);
      expect(staleResults[0]!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      const freshResults = results.filter(
        (r) => !r.metadata?.cache?.stale && r.data != null && (r.data as Record<string, unknown>).user != null,
      );
      expect(freshResults.length).toBeGreaterThanOrEqual(1);

      sub();
      vi.useRealTimers();
    });

    it('should carry stale flag on fragment result when entity is stale', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op): op is Operation & { variant: 'request' } => op.variant === 'request'),
          mergeMap((op) => {
            callCount++;
            return fromPromise(
              (async () => {
                if (callCount > 1) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, 100);
                  });
                }
                return {
                  operation: op,
                  data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
                } as OperationResult;
              })(),
            );
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'StaleFragGetUser',
        key: 'stale-fq1',
        selections: [
          {
            kind: 'Field',
            name: 'user',
            type: 'User',
            selections: fragmentSelections,
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'StaleUserFragment',
        key: 'stale-f1',
        metadata: { fragment: { ref: { __fragmentRef: 'User:1' } } },
        selections: fragmentSelections,
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      subject.next(fragmentOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      const initialFragment = results.find((r) => r.operation.key === 'stale-f1');
      expect(initialFragment).toBeDefined();
      expect(initialFragment!.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });
      expect(initialFragment!.metadata?.cache?.stale).toBeFalsy();

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await Promise.resolve();
      await Promise.resolve();

      const fragmentResults = results.filter((r) => r.operation.key === 'stale-f1');
      const staleFragment = fragmentResults.find((r) => r.metadata?.cache?.stale === true);
      expect(staleFragment).toBeDefined();
      expect(staleFragment!.data).toEqual({ __typename: 'User', id: '1', name: 'Alice' });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const finalFragments = results.filter((r) => r.operation.key === 'stale-f1');
      const freshFragment = finalFragments.at(-1)!;
      expect(freshFragment.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['name'],
        value: 'Bob',
      });
      expect(freshFragment.metadata?.cache?.stale).toBeFalsy();

      sub();
      vi.useRealTimers();
    });

    it('should clear stale flag after refetch completes and subsequent cache read is fresh', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });
      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op): op is Operation & { variant: 'request' } => op.variant === 'request'),
          mergeMap((op) => {
            callCount++;
            return fromPromise(
              (async () => {
                if (callCount > 1) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                  });
                }
                return {
                  operation: op,
                  data: { user: { __typename: 'User', id: '1', name: callCount === 1 ? 'Alice' : 'Bob' } },
                } as OperationResult;
              })(),
            );
          }),
        );

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: client as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'StaleClearGetUser',
        key: 'stale-clear-q1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(callCount).toBe(1);
      expect(results).toHaveLength(1);
      expect(results[0]!.metadata?.cache?.stale).toBeFalsy();

      result.extension.invalidate({ __typename: 'User', id: '1' });
      await Promise.resolve();

      const staleEmission = results.find((r) => r.metadata?.cache?.stale === true);
      expect(staleEmission).toBeDefined();
      expect(staleEmission!.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(callCount).toBe(2);

      const finalResult = results.at(-1)!;
      expect(finalResult.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Bob',
      });
      expect(finalResult.metadata?.cache?.stale).toBeFalsy();

      sub();
      vi.useRealTimers();
    });
  });

  describe('optimistic updates', () => {
    const userSelections = [
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

    const mutationSelections = [
      {
        kind: 'Field' as const,
        name: 'updateUser',
        type: 'User',
        selections: [
          { kind: 'Field' as const, name: '__typename', type: 'String' },
          { kind: 'Field' as const, name: 'id', type: 'ID' },
          { kind: 'Field' as const, name: 'name', type: 'String' },
        ],
      },
    ];

    it('should apply optimistic response to cache immediately', async () => {
      vi.useFakeTimers();

      const exchange = cacheExchange();
      const subject = makeSubject<Operation>();
      const networkResults: { resolve: (result: OperationResult) => void }[] = [];

      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          mergeMap((op) => {
            return fromPromise(
              new Promise<OperationResult>((resolve) => {
                networkResults.push({ resolve: (r) => resolve({ ...r, operation: op }) });
              }),
            );
          }),
        );

      const results: OperationResult[] = [];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        selections: userSelections,
      });

      const sub = pipe(
        subject.source,
        exchange({ forward, client: client as never }).io,
        subscribe({ next: (r) => results.push(r) }),
      );

      subject.next(queryOp);
      await Promise.resolve();

      networkResults[0]!.resolve({
        operation: queryOp,
        data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
      });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        selections: mutationSelections,
        metadata: {
          cache: {
            optimisticResponse: { updateUser: { __typename: 'User', id: '1', name: 'Bob' } },
          },
        },
      });

      subject.next(mutationOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const latestResult = results.at(-1)!;
      expect(latestResult.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Bob',
      });

      networkResults[1]!.resolve({
        operation: mutationOp,
        data: { updateUser: { __typename: 'User', id: '1', name: 'Bob' } },
      });

      await vi.runAllTimersAsync();

      sub();
      vi.useRealTimers();
    });

    it('should replace optimistic data with server response on success', async () => {
      vi.useFakeTimers();

      const exchange = cacheExchange();
      const subject = makeSubject<Operation>();
      const networkResults: { resolve: (result: OperationResult) => void }[] = [];

      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          mergeMap((op) => {
            return fromPromise(
              new Promise<OperationResult>((resolve) => {
                networkResults.push({ resolve: (r) => resolve({ ...r, operation: op }) });
              }),
            );
          }),
        );

      const results: OperationResult[] = [];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        selections: userSelections,
      });

      const sub = pipe(
        subject.source,
        exchange({ forward, client: client as never }).io,
        subscribe({ next: (r) => results.push(r) }),
      );

      subject.next(queryOp);
      await Promise.resolve();

      networkResults[0]!.resolve({
        operation: queryOp,
        data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
      });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        selections: mutationSelections,
        metadata: {
          cache: {
            optimisticResponse: { updateUser: { __typename: 'User', id: '1', name: 'Optimistic' } },
          },
        },
      });

      subject.next(mutationOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const optimisticResult = results.at(-1)!;
      expect(optimisticResult.metadata?.cache?.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Optimistic',
      });

      networkResults[1]!.resolve({
        operation: mutationOp,
        data: { updateUser: { __typename: 'User', id: '1', name: 'ServerName' } },
      });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const patchResults = results.filter((r) => r.metadata?.cache?.patches);
      const lastPatch = patchResults.at(-1)!;
      expect(lastPatch.metadata!.cache!.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'ServerName',
      });

      sub();
      vi.useRealTimers();
    });

    it('should rollback optimistic data on error', async () => {
      vi.useFakeTimers();

      const exchange = cacheExchange();
      const subject = makeSubject<Operation>();
      const networkResults: { resolve: (result: OperationResult) => void }[] = [];

      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          filter((op) => op.variant === 'request'),
          mergeMap((op) => {
            return fromPromise(
              new Promise<OperationResult>((resolve) => {
                networkResults.push({ resolve: (r) => resolve({ ...r, operation: op }) });
              }),
            );
          }),
        );

      const results: OperationResult[] = [];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        selections: userSelections,
      });

      const sub = pipe(
        subject.source,
        exchange({ forward, client: client as never }).io,
        subscribe({ next: (r) => results.push(r) }),
      );

      subject.next(queryOp);
      await Promise.resolve();

      networkResults[0]!.resolve({
        operation: queryOp,
        data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
      });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        selections: mutationSelections,
        metadata: {
          cache: {
            optimisticResponse: { updateUser: { __typename: 'User', id: '1', name: 'Optimistic' } },
          },
        },
      });

      subject.next(mutationOp);
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      networkResults[1]!.resolve({
        operation: mutationOp,
        errors: [{ message: 'Server error' }] as never,
      });

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      const patchResults = results.filter((r) => r.metadata?.cache?.patches);
      const lastPatch = patchResults.at(-1)!;
      expect(lastPatch.metadata!.cache!.patches).toContainEqual({
        type: 'set',
        path: ['user', 'name'],
        value: 'Alice',
      });

      sub();
      vi.useRealTimers();
    });

    it('should forward mutations without optimisticResponse normally', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange();
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { updateUser: { __typename: 'User', id: '1', name: 'Bob' } } };
      });

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateUser',
        selections: mutationSelections,
      });

      const results = await testExchange(exchange, forward, [mutationOp], client);

      expect(results).toHaveLength(1);
      expect(forwardedOps.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should emit error when cache remains partial after network response', async () => {
      const exchange = cacheExchange({ fetchPolicy: 'cache-first' });

      const forward = makeTestForward((op) => ({
        operation: op,
        data: {
          user: { __typename: 'User', id: '1', name: 'Alice' },
        },
      }));

      const operation = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        selections: [
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
        ],
      });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);

      const errors = results[0]?.errors;
      expect(errors).toBeDefined();
      expect(errors?.length).toBeGreaterThan(0);
      expect(errors?.[0]?.message).toContain('denormalize');
    });
  });

  describe('Query root fragment operations', () => {
    const entitySchema: SchemaMeta = {
      entities: { Entity: { keyFields: ['id'] } },
      inputs: {},
      scalars: {},
    };

    const entityClient = makeTestClient({ schema: entitySchema });

    it('should subscribe Query root fragment to cache and receive patches on mutation', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') {
          return { operation: op };
        }
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              entity: {
                __typename: 'Entity',
                id: '1',
                slug: 'test-slug',
                title: 'Original Title',
              },
            },
          };
        }
        if ((op as RequestOperation).artifact?.kind === 'mutation') {
          return {
            operation: op,
            data: {
              updateEntity: {
                __typename: 'Entity',
                id: '1',
                title: 'Updated Title',
              },
            },
          };
        }
        return { operation: op };
      });

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: entityClient as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'EntityPage_Query',
        key: 'root-frag-q1',
        selections: [
          {
            kind: 'FragmentSpread',
            name: 'Page_query',
            args: { slug: { kind: 'variable', name: 'slug' } },
            selections: [
              {
                kind: 'Field',
                name: 'entity',
                type: 'Entity',
                args: { slug: { kind: 'variable', name: 'slug' } },
                selections: [
                  { kind: 'Field', name: '__typename', type: 'String' },
                  { kind: 'Field', name: 'id', type: 'ID' },
                  { kind: 'Field', name: 'slug', type: 'String' },
                  { kind: 'Field', name: 'title', type: 'String' },
                ],
              },
            ],
          },
        ],
        variableDefs: [{ name: 'slug', type: 'String!' }],
        variables: { slug: 'test-slug' },
      });

      subject.next(queryOp);
      await Promise.resolve();

      const queryResult = results.find((r) => r.operation.key === 'root-frag-q1');
      expect(queryResult).toBeDefined();
      expect((queryResult!.data as Record<string, unknown>).__fragmentRef).toBe('__root');

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'Page_query',
        key: 'root-frag-f1',
        metadata: { fragment: { ref: queryResult!.data } },
        selections: [
          {
            kind: 'Field',
            name: 'entity',
            type: 'Entity',
            args: { slug: { kind: 'variable', name: 'slug' } },
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'slug', type: 'String' },
              { kind: 'Field', name: 'title', type: 'String' },
            ],
          },
        ],
      });

      subject.next(fragmentOp);
      await Promise.resolve();

      const fragmentResult = results.find((r) => r.operation.key === 'root-frag-f1');
      expect(fragmentResult).toBeDefined();

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateEntity',
        key: 'root-frag-m1',
        selections: [
          {
            kind: 'Field',
            name: 'updateEntity',
            type: 'Entity',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'title', type: 'String' },
            ],
          },
        ],
      });

      subject.next(mutationOp);
      await Promise.resolve();

      const fragmentResults = results.filter((r) => r.operation.key === 'root-frag-f1');
      expect(fragmentResults.length).toBeGreaterThanOrEqual(2);

      const patchResult = fragmentResults.find((r) => r.metadata?.cache?.patches);
      expect(patchResult).toBeDefined();
      expect(patchResult!.metadata!.cache!.patches).toContainEqual({
        type: 'set',
        path: ['entity', 'title'],
        value: 'Updated Title',
      });

      sub();
    });

    it('should subscribe Query root fragment without fragment args to cache and receive patches on mutation', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') {
          return { operation: op };
        }
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              entity: {
                __typename: 'Entity',
                id: '1',
                slug: 'test-slug',
                title: 'Original Title',
              },
            },
          };
        }
        if ((op as RequestOperation).artifact?.kind === 'mutation') {
          return {
            operation: op,
            data: {
              updateEntity: {
                __typename: 'Entity',
                id: '1',
                title: 'Updated Title',
              },
            },
          };
        }
        return { operation: op };
      });

      const subject = makeSubject<Operation>();
      const result = exchange({ forward, client: entityClient as never });
      const results: OperationResult[] = [];

      const sub = pipe(subject.source, result.io, subscribe({ next: (r) => results.push(r) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'EntityPage_Query',
        key: 'root-no-frag-args-q1',
        selections: [
          {
            kind: 'FragmentSpread',
            name: 'Page_query',
            selections: [
              {
                kind: 'Field',
                name: 'entity',
                type: 'Entity',
                args: { slug: { kind: 'variable', name: 'slug' } },
                selections: [
                  { kind: 'Field', name: '__typename', type: 'String' },
                  { kind: 'Field', name: 'id', type: 'ID' },
                  { kind: 'Field', name: 'slug', type: 'String' },
                  { kind: 'Field', name: 'title', type: 'String' },
                ],
              },
            ],
          },
        ],
        variableDefs: [{ name: 'slug', type: 'String!' }],
        variables: { slug: 'test-slug' },
      });

      subject.next(queryOp);
      await Promise.resolve();

      const queryResult = results.find((r) => r.operation.key === 'root-no-frag-args-q1');
      expect(queryResult).toBeDefined();
      expect((queryResult!.data as Record<string, unknown>).__fragmentRef).toBe('__root');

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'Page_query',
        key: 'root-no-frag-args-f1',
        metadata: { fragment: { ref: queryResult!.data } },
        selections: [
          {
            kind: 'Field',
            name: 'entity',
            type: 'Entity',
            args: { slug: { kind: 'variable', name: 'slug' } },
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'slug', type: 'String' },
              { kind: 'Field', name: 'title', type: 'String' },
            ],
          },
        ],
      });

      subject.next(fragmentOp);
      await Promise.resolve();

      const fragmentResult = results.find((r) => r.operation.key === 'root-no-frag-args-f1');
      expect(fragmentResult).toBeDefined();
      expect(fragmentResult!.data as Record<string, unknown>).toEqual({
        entity: {
          __typename: 'Entity',
          id: '1',
          slug: 'test-slug',
          title: 'Original Title',
        },
      });

      const mutationOp = makeTestOperation({
        kind: 'mutation',
        name: 'UpdateEntity',
        key: 'root-no-frag-args-m1',
        selections: [
          {
            kind: 'Field',
            name: 'updateEntity',
            type: 'Entity',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'title', type: 'String' },
            ],
          },
        ],
      });

      subject.next(mutationOp);
      await Promise.resolve();

      const fragmentResults = results.filter((r) => r.operation.key === 'root-no-frag-args-f1');
      expect(fragmentResults.length).toBeGreaterThanOrEqual(2);

      const patchResult = fragmentResults.find((r) => r.metadata?.cache?.patches);
      expect(patchResult).toBeDefined();
      expect(patchResult!.metadata!.cache!.patches).toContainEqual({
        type: 'set',
        path: ['entity', 'title'],
        value: 'Updated Title',
      });

      sub();
    });
  });

  describe('synchronous fragment emission', () => {
    it('should emit entity fragment data synchronously when entity exists in cache', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
          };
        }
        return { operation: op };
      });

      const subject = makeSubject<Operation>();
      const results: OperationResult[] = [];

      const exchangeResult = exchange({ forward, client: client as never });

      const unsub = pipe(subject.source, exchangeResult.io, subscribe({ next: (result) => results.push(result) }));

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'query-1',
        selections: [
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
        ],
      });

      subject.next(queryOp);
      await Promise.resolve();

      const fragmentRef = { __fragmentRef: 'User:1' };
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'fragment-1',
        metadata: { fragment: { ref: fragmentRef } },
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      });

      const resultCountBefore = results.length;
      subject.next(fragmentOp);

      const fragmentResult = results.find((r) => r.operation.key === 'fragment-1');
      expect(fragmentResult).toBeDefined();
      expect(results.length).toBeGreaterThan(resultCountBefore);
      expect(fragmentResult!.data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
      });

      unsub();
    });

    it('should emit entity fragment data synchronously via peek through Client-like pipeline', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
          };
        }
        return { operation: op };
      });

      const operations$ = makeSubject<Operation>();
      const exchangeResult = exchange({ forward, client: client as never });
      const results$ = pipe(operations$.source, share(), exchangeResult.io, share());

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUser',
        key: 'query-peek-1',
        selections: [
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
        ],
      });

      const queryResults: OperationResult[] = [];
      const queryUnsub = pipe(
        results$,
        initialize(() => operations$.next(queryOp)),
        filter((r: OperationResult) => r.operation.key === 'query-peek-1'),
        subscribe({ next: (result: OperationResult) => queryResults.push(result) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const fragmentRef = { __fragmentRef: 'User:1' };
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'fragment-peek-1',
        metadata: { fragment: { ref: fragmentRef } },
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      });

      const fragmentSource = pipe(
        results$,
        initialize(() => operations$.next(fragmentOp)),
        filter((r: OperationResult) => r.operation.key === 'fragment-peek-1'),
        finalize(() => operations$.next({ variant: 'teardown', key: 'fragment-peek-1', metadata: {} })),
        share(),
      );

      const result = pipe(fragmentSource, peek);

      expect(result).toBeDefined();
      expect(result.data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
      });

      queryUnsub();
    });

    it('should emit Query root fragment data synchronously via peek', async () => {
      const entitySchema: SchemaMeta = {
        entities: { Entity: { keyFields: ['id'] } },
        inputs: {},
        scalars: {},
      };

      const entityClient = makeTestClient({ schema: entitySchema });
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              entity: { __typename: 'Entity', id: '1', title: 'Hello' },
            },
          };
        }
        return { operation: op };
      });

      const operations$ = makeSubject<Operation>();
      const exchangeResult = exchange({ forward, client: entityClient as never });
      const results$ = pipe(operations$.source, share(), exchangeResult.io, share());

      const fragmentSelections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'Entity',
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'Page_Query',
        key: 'root-sync-q1',
        selections: [
          {
            kind: 'FragmentSpread',
            name: 'Page_fragment',
            selections: fragmentSelections,
          },
        ],
      });

      const queryResults: OperationResult[] = [];
      const queryUnsub = pipe(
        results$,
        initialize(() => operations$.next(queryOp)),
        filter((r: OperationResult) => r.operation.key === 'root-sync-q1'),
        subscribe({ next: (result: OperationResult) => queryResults.push(result) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const queryData = queryResults[0]!.data as Record<string, unknown>;
      expect(queryData.__fragmentRef).toBe('__root');

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'Page_fragment',
        key: 'root-sync-f1',
        metadata: { fragment: { ref: queryData } },
        selections: fragmentSelections,
      });

      const fragmentSource = pipe(
        results$,
        initialize(() => operations$.next(fragmentOp)),
        filter((r: OperationResult) => r.operation.key === 'root-sync-f1'),
        finalize(() => operations$.next({ variant: 'teardown', key: 'root-sync-f1', metadata: {} })),
        share(),
      );

      const result = pipe(fragmentSource, peek);

      expect(result).toBeDefined();
      expect((result.data as Record<string, unknown>).entity).toEqual({
        __typename: 'Entity',
        id: '1',
        title: 'Hello',
      });

      queryUnsub();
    });

    it('should detect partial and refetch when __root is partially populated by a different query with root fragment spread', async () => {
      const entitySchema: SchemaMeta = {
        entities: { Widget: { keyFields: ['id'] }, User: { keyFields: ['id'] } },
        inputs: {},
        scalars: {},
      };

      const entityClient = makeTestClient({ schema: entitySchema });
      const exchange = cacheExchange();

      const dashboardResponse$ = makeSubject<OperationResult>();

      const forward: ExchangeIO = (ops$) =>
        pipe(
          ops$,
          mergeMap((op): Source<OperationResult> => {
            if (op.variant !== 'request') return fromValue({ operation: op });
            const reqOp = op as RequestOperation;
            if (reqOp.artifact?.kind === 'query' && reqOp.artifact.name === 'Layout_Query') {
              return fromValue({
                operation: op,
                data: {
                  me: { __typename: 'User', id: '1' },
                  impersonation: null,
                  notes: [{ __typename: 'Note', id: 'n1' }],
                },
              });
            }
            if (reqOp.artifact?.kind === 'query' && reqOp.artifact.name === 'DashboardSlugPage_Query') {
              return dashboardResponse$.source;
            }
            return fromValue({ operation: op });
          }),
        );

      const operations$ = makeSubject<Operation>();
      const exchangeResult = exchange({ forward, client: entityClient as never });
      const results$ = pipe(operations$.source, share(), exchangeResult.io, share());

      // Step 1: Execute layout query (populates __root with me, impersonation, notes)
      const layoutOp = makeTestOperation({
        kind: 'query',
        name: 'Layout_Query',
        key: 'layout-q1',
        selections: [
          {
            kind: 'Field' as const,
            name: 'me',
            type: 'User',
            nullable: true as const,
            selections: [{ kind: 'Field' as const, name: 'id', type: 'ID' }],
          },
          { kind: 'Field' as const, name: 'impersonation', type: 'Impersonation', nullable: true as const },
          {
            kind: 'Field' as const,
            name: 'notes',
            type: 'Note',
            array: true as const,
            selections: [{ kind: 'Field' as const, name: 'id', type: 'ID' }],
          },
        ],
      });

      const layoutResults: OperationResult[] = [];
      pipe(
        results$,
        initialize(() => operations$.next(layoutOp)),
        filter((r: OperationResult) => r.operation.key === 'layout-q1'),
        subscribe({ next: (result: OperationResult) => layoutResults.push(result) }),
      );
      await Promise.resolve();
      expect(layoutResults.length).toBeGreaterThan(0);

      // Step 2: Execute dashboard query (has root-level fragment spread for widgets)
      // The cache has `me` from layout but NOT `widgets` from the fragment spread.
      const fragmentSelections = [
        {
          kind: 'Field' as const,
          name: 'widgets',
          type: 'Widget',
          array: true as const,
          selections: [
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'name', type: 'String' },
            { kind: 'Field' as const, name: 'data', type: 'JSON' },
            { kind: 'Field' as const, name: 'order', type: 'String' },
          ],
        },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'DashboardSlugPage_Query',
        key: 'root-mixed-q1',
        selections: [
          {
            kind: 'Field' as const,
            name: 'me',
            type: 'User',
            nullable: true as const,
            selections: [{ kind: 'Field' as const, name: 'id', type: 'ID' }],
          },
          {
            kind: 'FragmentSpread' as const,
            name: 'WidgetGroup_query',
            selections: fragmentSelections as never,
          },
        ],
      });

      const queryResults: OperationResult[] = [];
      const queryUnsub = pipe(
        results$,
        initialize(() => operations$.next(queryOp)),
        filter((r: OperationResult) => r.operation.key === 'root-mixed-q1'),
        subscribe({ next: (result: OperationResult) => queryResults.push(result) }),
      );
      await Promise.resolve();

      // Step 3: Cache correctly detects partial (fragment's `widgets` missing from __root)
      // so no synchronous cache emission occurs — the query is forwarded to network.
      expect(queryResults.length).toBe(0);

      // Step 4: Network response arrives with full data
      dashboardResponse$.next({
        operation: queryOp,
        data: {
          me: { __typename: 'User', id: '1' },
          widgets: [
            { __typename: 'Widget', id: 'w1', name: 'Widget 1', data: '{}', order: 'a0' },
            { __typename: 'Widget', id: 'w2', name: 'Widget 2', data: '{}', order: 'a1' },
          ],
        },
      });
      await Promise.resolve();

      // Step 5: Cache writes the response and emits data with fragment masking
      expect(queryResults.length).toBeGreaterThan(0);

      const queryData = queryResults[0]!.data as Record<string, unknown>;
      expect(queryData.__fragmentRef).toBe('__root');

      // Step 6: Fragment read via peek now finds widgets in __root
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'WidgetGroup_query',
        key: 'root-mixed-f1',
        metadata: { fragment: { ref: queryData } },
        selections: fragmentSelections as never,
      });

      const fragmentSource = pipe(
        results$,
        initialize(() => operations$.next(fragmentOp)),
        filter((r: OperationResult) => r.operation.key === 'root-mixed-f1'),
        finalize(() => operations$.next({ variant: 'teardown', key: 'root-mixed-f1', metadata: {} })),
        share(),
      );

      const result = pipe(fragmentSource, peek);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>).widgets).toEqual([
        { id: 'w1', name: 'Widget 1', data: '{}', order: 'a0' },
        { id: 'w2', name: 'Widget 2', data: '{}', order: 'a1' },
      ]);

      queryUnsub();
    });

    it('should emit Query root fragment with args data synchronously via peek', async () => {
      const entitySchema: SchemaMeta = {
        entities: { Entity: { keyFields: ['id'] } },
        inputs: {},
        scalars: {},
      };

      const entityClient = makeTestClient({ schema: entitySchema });
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              entity: { __typename: 'Entity', id: '1', slug: 'test-slug', title: 'Hello' },
            },
          };
        }
        return { operation: op };
      });

      const operations$ = makeSubject<Operation>();
      const exchangeResult = exchange({ forward, client: entityClient as never });
      const results$ = pipe(operations$.source, share(), exchangeResult.io, share());

      const fragmentSelections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'Entity',
          args: { slug: { kind: 'variable' as const, name: 'slug' } },
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'slug', type: 'String' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'EntityPage_Query',
        key: 'root-args-sync-q1',
        selections: [
          {
            kind: 'FragmentSpread',
            name: 'Page_query',
            args: { slug: { kind: 'variable', name: 'slug' } },
            selections: fragmentSelections,
          },
        ],
        variableDefs: [{ name: 'slug', type: 'String!' }],
        variables: { slug: 'test-slug' },
      });

      const queryResults: OperationResult[] = [];
      const queryUnsub = pipe(
        results$,
        initialize(() => operations$.next(queryOp)),
        filter((r: OperationResult) => r.operation.key === 'root-args-sync-q1'),
        subscribe({ next: (result: OperationResult) => queryResults.push(result) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const queryData = queryResults[0]!.data as Record<string, unknown>;
      expect(queryData.__fragmentRef).toBe('__root');

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'Page_query',
        key: 'root-args-sync-f1',
        metadata: { fragment: { ref: queryData } },
        selections: fragmentSelections,
      });

      const fragmentSource = pipe(
        results$,
        initialize(() => operations$.next(fragmentOp)),
        filter((r: OperationResult) => r.operation.key === 'root-args-sync-f1'),
        finalize(() => operations$.next({ variant: 'teardown', key: 'root-args-sync-f1', metadata: {} })),
        share(),
      );

      const result = pipe(fragmentSource, peek);

      expect(result).toBeDefined();
      expect((result.data as Record<string, unknown>).entity).toEqual({
        __typename: 'Entity',
        id: '1',
        slug: 'test-slug',
        title: 'Hello',
      });

      queryUnsub();
    });

    it('should emit entity fragment data synchronously via peek on real Client', async () => {
      const mockHttpExchange = (): Exchange => {
        return () => ({
          name: 'mock-http',
          io: (ops$) =>
            pipe(
              ops$,
              filter((op) => op.variant === 'request'),
              map((op) => ({
                operation: op,
                data: { user: { __typename: 'User', id: '1', name: 'Alice' } },
              })),
            ),
        });
      };

      const realClient = new Client({
        schema,
        scalars: {},
        exchanges: [cacheExchange(), mockHttpExchange()],
      });

      const queryArtifact = {
        kind: 'query' as const,
        name: 'GetUser',
        body: '',
        selections: [
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
        ],
      } as Artifact<'query'>;

      const queryResults: OperationResult[] = [];
      const querySub = pipe(
        realClient.executeQuery(queryArtifact, {} as never),
        subscribe({ next: (r: OperationResult) => queryResults.push(r) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const fragmentArtifact = {
        kind: 'fragment' as const,
        name: 'UserFragment',
        body: '',
        selections: [
          { kind: 'Field' as const, name: '__typename', type: 'String' },
          { kind: 'Field' as const, name: 'id', type: 'ID' },
          { kind: 'Field' as const, name: 'name', type: 'String' },
        ],
      } as Artifact<'fragment'>;

      const fragmentRef = { __fragmentRef: 'User:1' } as unknown as FragmentRefs<string>;

      const result = pipe(realClient.executeFragment(fragmentArtifact, fragmentRef), peek);

      expect(result).toBeDefined();
      expect(result.data).toEqual({
        __typename: 'User',
        id: '1',
        name: 'Alice',
      });

      querySub();
    });

    it('should emit Query root fragment data synchronously via peek on real Client', async () => {
      const entitySchema: SchemaMeta = {
        entities: { Entity: { keyFields: ['id'] } },
        inputs: {},
        scalars: {},
      };

      const mockHttpExchange = (): Exchange => {
        return () => ({
          name: 'mock-http',
          io: (ops$) =>
            pipe(
              ops$,
              filter((op) => op.variant === 'request'),
              map((op) => ({
                operation: op,
                data: {
                  entity: { __typename: 'Entity', id: '1', slug: 'test', title: 'Hello' },
                },
              })),
            ),
        });
      };

      const realClient = new Client({
        schema: entitySchema,
        scalars: {},
        exchanges: [cacheExchange(), mockHttpExchange()],
      });

      const fragmentSelections = [
        {
          kind: 'Field' as const,
          name: 'entity',
          type: 'Entity',
          args: { slug: { kind: 'variable' as const, name: 'slug' } },
          selections: [
            { kind: 'Field' as const, name: '__typename', type: 'String' },
            { kind: 'Field' as const, name: 'id', type: 'ID' },
            { kind: 'Field' as const, name: 'slug', type: 'String' },
            { kind: 'Field' as const, name: 'title', type: 'String' },
          ],
        },
      ];

      const queryArtifact = {
        kind: 'query' as const,
        name: 'EntityPage_Query',
        body: '',
        variableDefs: [{ name: 'slug', type: 'String!' }],
        selections: [
          {
            kind: 'FragmentSpread' as const,
            name: 'Page_query',
            args: { slug: { kind: 'variable' as const, name: 'slug' } },
            selections: fragmentSelections,
          },
        ],
      } as Artifact<'query'>;

      const queryResults: OperationResult[] = [];
      const querySub = pipe(
        realClient.executeQuery(queryArtifact, { slug: 'test' } as never),
        subscribe({ next: (r: OperationResult) => queryResults.push(r) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const queryData = queryResults[0]!.data as Record<string, unknown>;
      expect(queryData.__fragmentRef).toBe('__root');

      const fragmentArtifact = {
        kind: 'fragment' as const,
        name: 'Page_query',
        body: '',
        selections: fragmentSelections,
      } as Artifact<'fragment'>;

      const result = pipe(
        realClient.executeFragment(fragmentArtifact, queryData as unknown as FragmentRefs<string>),
        peek,
      );

      expect(result).toBeDefined();
      expect((result.data as Record<string, unknown>).entity).toEqual({
        __typename: 'Entity',
        id: '1',
        slug: 'test',
        title: 'Hello',
      });

      querySub();
    });

    it('should emit fragment array data synchronously via peek', async () => {
      const exchange = cacheExchange();

      const forward = makeTestForward((op) => {
        if (op.variant !== 'request') return { operation: op };
        if ((op as RequestOperation).artifact?.kind === 'query') {
          return {
            operation: op,
            data: {
              users: [
                { __typename: 'User', id: '1', name: 'Alice' },
                { __typename: 'User', id: '2', name: 'Bob' },
              ],
            },
          };
        }
        return { operation: op };
      });

      const operations$ = makeSubject<Operation>();
      const exchangeResult = exchange({ forward, client: client as never });
      const results$ = pipe(operations$.source, share(), exchangeResult.io, share());

      const fragmentSelections = [
        { kind: 'Field' as const, name: '__typename', type: 'String' },
        { kind: 'Field' as const, name: 'id', type: 'ID' },
        { kind: 'Field' as const, name: 'name', type: 'String' },
      ];

      const queryOp = makeTestOperation({
        kind: 'query',
        name: 'GetUsers',
        key: 'arr-sync-q1',
        selections: [
          {
            kind: 'Field',
            name: 'users',
            type: '[User]',
            selections: [
              ...fragmentSelections,
              { kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections },
            ],
          },
        ],
      });

      const queryResults: OperationResult[] = [];
      const queryUnsub = pipe(
        results$,
        initialize(() => operations$.next(queryOp)),
        filter((r: OperationResult) => r.operation.key === 'arr-sync-q1'),
        subscribe({ next: (result: OperationResult) => queryResults.push(result) }),
      );

      await Promise.resolve();
      expect(queryResults.length).toBeGreaterThan(0);

      const usersData = (queryResults[0]!.data as Record<string, unknown>).users as Record<string, unknown>[];
      const fragmentRefs = usersData.map((u) => ({ __fragmentRef: `User:${String(u.id)}` }));

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'arr-sync-f1',
        metadata: { fragment: { ref: fragmentRefs } },
        selections: fragmentSelections,
      });

      const fragmentSource = pipe(
        results$,
        initialize(() => operations$.next(fragmentOp)),
        filter((r: OperationResult) => r.operation.key === 'arr-sync-f1'),
        finalize(() => operations$.next({ variant: 'teardown', key: 'arr-sync-f1', metadata: {} })),
        share(),
      );

      const result = pipe(fragmentSource, peek);

      expect(result).toBeDefined();
      expect(result.data).toEqual([
        { __typename: 'User', id: '1', name: 'Alice' },
        { __typename: 'User', id: '2', name: 'Bob' },
      ]);

      queryUnsub();
    });
  });
});
