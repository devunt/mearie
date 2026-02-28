import { describe, it, expect, vi } from 'vitest';
import { cacheExchange } from './cache.ts';
import { makeTestOperation, makeTestForward, testExchange, makeTestClient } from './test-utils.ts';
import type { SchemaMeta } from '@mearie/shared';
import type { Operation, ExchangeIO, OperationResult } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { subscribe } from '../stream/sinks/subscribe.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';
import { map } from '../stream/operators/map.ts';
import { filter } from '../stream/operators/filter.ts';
import { mergeMap as mergeMapOp } from '../stream/operators/merge-map.ts';
import { fromPromise } from '../stream/sources/from-promise.ts';

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
        metadata: { fragmentRef },
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
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results).toHaveLength(1);
    });

    it('should require fragmentRef in metadata', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results[0]!.errors).toBeDefined();
    });

    it('should error if fragmentRef missing', async () => {
      const exchange = cacheExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation], client);

      expect(results[0]!.errors).toHaveLength(1);
      expect(results[0]!.errors![0]!.message).toContain('fragmentRef');
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
        metadata: { fragmentRef: [{ __fragmentRef: 'User:1' }, { __fragmentRef: 'User:2' }] },
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
        metadata: { fragmentRef: [{ __fragmentRef: 'User:1' }, { __fragmentRef: 'User:2' }] },
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
      expect(fragmentResults[1]!.data).toEqual([
        { __typename: 'User', id: '1', email: 'alice-new@example.com' },
        { __typename: 'User', id: '2', email: 'bob@example.com' },
      ]);
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
      expect(results[1]!.data).toEqual({
        updateUser: { __typename: 'User', id: '1', name: 'Bob' },
      });

      expect(results[2]!.data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Bob' },
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
        metadata: { fragmentRef },
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
      expect(results[2]!.data).toEqual({
        updateUser: { __typename: 'User', id: '1', email: 'bob@example.com' },
      });
      expect(results[3]!.data).toEqual({
        user: { __typename: 'User', id: '1', name: 'Alice', email: 'bob@example.com' },
      });
      expect(results[4]!.data).toEqual({
        __typename: 'User',
        id: '1',
        email: 'bob@example.com',
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
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f1',
        metadata: { fragmentRef: { __fragmentRef: 'User:1' } },
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
      expect(fragmentResults.some((r) => r.data === null)).toBe(false);
      expect(fragmentResults.at(-1)!.data).toEqual({ __typename: 'User', id: '1', name: 'Bob' });

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
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f2',
        metadata: { fragmentRef: { __fragmentRef: 'User:1' } },
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
      expect(fragmentResults.some((r) => r.data === null)).toBe(false);
      expect(fragmentResults.at(-1)!.data).toEqual({ __typename: 'User', id: '1', name: 'Bob' });

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
          mergeMapOp((op) => {
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
            selections: [{ kind: 'FragmentSpread', name: 'UserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f3',
        metadata: { fragmentRef: { __fragmentRef: 'User:1' } },
        selections: fragmentSelections,
      });

      const fragmentResubscribeOp = makeTestOperation({
        kind: 'fragment',
        name: 'UserFragment',
        key: 'f4',
        metadata: { fragmentRef: { __fragmentRef: 'User:1' } },
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
      expect(resubscribeResults.some((r) => r.data === null)).toBe(false);
      expect(resubscribeResults.at(-1)!.data).toEqual({ __typename: 'User', id: '1', name: 'Bob' });

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
          mergeMapOp((op) => {
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
      expect(freshResult.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Bob' } });
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
          mergeMapOp((op) => {
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
            selections: [{ kind: 'FragmentSpread', name: 'StaleUserFragment', selections: fragmentSelections }],
          },
        ],
      });

      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        name: 'StaleUserFragment',
        key: 'stale-f1',
        metadata: { fragmentRef: { __fragmentRef: 'User:1' } },
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
      expect(freshFragment.data).toEqual({ __typename: 'User', id: '1', name: 'Bob' });
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
          mergeMapOp((op) => {
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
      expect(finalResult.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Bob' } });
      expect(finalResult.metadata?.cache?.stale).toBeFalsy();

      sub();
      vi.useRealTimers();
    });
  });
});
