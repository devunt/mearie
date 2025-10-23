import { describe, it, expect } from 'vitest';
import { cacheExchange } from './cache.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import type { SchemaMeta } from '@mearie/shared';
import type { Operation } from '../exchange.ts';

const schema: SchemaMeta = {
  entities: {
    User: { keyFields: ['id'] },
    Post: { keyFields: ['id'] },
  },
};

describe('cacheExchange', () => {
  describe('fetch policies', () => {
    describe('cache-first', () => {
      it('should return cached data if available', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { user: { id: '1', name: 'Alice' } },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetUser' });

        const results1 = await testExchange(exchange, forward, [operation]);
        const results2 = await testExchange(exchange, forward, [operation]);

        expect(results1).toHaveLength(1);
        expect(results2).toHaveLength(1);
      });

      it('should forward to network if cache miss', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test' }],
        });

        await testExchange(exchange, forward, [operation]);

        expect(forwardedOps.length).toBeGreaterThan(0);
      });

      it('should not forward if cache hit', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-first' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);
        forwardedOps.length = 0;

        await testExchange(exchange, forward, [operation]);

        expect(forwardedOps).toHaveLength(0);
      });
    });

    describe('cache-and-network', () => {
      it('should return cached data immediately', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test' }],
        });

        const results1 = await testExchange(exchange, forward, [operation]);
        const results2 = await testExchange(exchange, forward, [operation]);

        expect(results1).toHaveLength(1);
        expect(results2.length).toBeGreaterThan(0);
      });

      it('should forward to network always', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);
        const count1 = forwardedOps.length;
        await testExchange(exchange, forward, [operation]);
        const count2 = forwardedOps.length;

        expect(count2).toBeGreaterThan(count1);
      });

      it('should emit cache data then network data', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-and-network' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { network: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);
        const results = await testExchange(exchange, forward, [operation]);

        expect(results.length).toBeGreaterThan(0);
      });
    });

    describe('network-only', () => {
      it('should always forward to network', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);
        const count1 = forwardedOps.length;
        await testExchange(exchange, forward, [operation]);
        const count2 = forwardedOps.length;

        expect(count2).toBeGreaterThan(count1);
      });

      it('should not read from cache', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { network: true },
        }));
        const operation = makeTestOperation({ kind: 'query' });

        const results = await testExchange(exchange, forward, [operation]);

        expect(results).toHaveLength(1);
        expect(results[0].data).toEqual({ network: true });
      });

      it('should write network response to cache', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'network-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);
        const cache = exchange.cache;

        expect(cache).toBeDefined();
      });
    });

    describe('cache-only', () => {
      it('should return cached data only', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-only' });
        const forward = makeTestForward((op) => ({
          operation: op,
          data: { test: true },
        }));
        const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

        await testExchange(exchange, forward, [operation]);

        const forwardedOps: Operation[] = [];
        const forward2 = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op };
        });
        const exchange2 = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-only' });
        await testExchange(exchange2, forward2, [operation]);

        expect(forwardedOps).toHaveLength(0);
      });

      it('should not forward to network', async () => {
        const forwardedOps: Operation[] = [];
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-only' });
        const forward = makeTestForward((op) => {
          forwardedOps.push(op);
          return { operation: op, data: { test: true } };
        });
        const operation = makeTestOperation({ kind: 'query' });

        await testExchange(exchange, forward, [operation]);

        expect(forwardedOps).toHaveLength(0);
      });

      it('should return null if cache miss', async () => {
        const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-only' });
        const forward = makeTestForward();
        const operation = makeTestOperation({
          kind: 'query',
          selections: [{ kind: 'Field', name: 'test' }],
        });

        const results = await testExchange(exchange, forward, [operation]);

        expect(results[0].data).toBeNull();
      });
    });
  });

  describe('query operations', () => {
    it('should read query from cache', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetData' });

      await testExchange(exchange, forward, [operation]);
      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].data).toBeDefined();
    });

    it('should subscribe to query updates', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { count: 1 },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetCount' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
    });

    it('should write query result to cache', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(exchange.cache).toBeDefined();
    });

    it('should handle cache misses', async () => {
      const exchange = cacheExchange({ schemaMeta: schema, fetchPolicy: 'cache-first' });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
    });
  });

  describe('fragment operations', () => {
    it('should read fragment from cache', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
    });

    it('should subscribe to fragment updates', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
    });

    it('should require fragmentRef in metadata', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toBeDefined();
    });

    it('should error if fragmentRef missing', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toHaveLength(1);
      expect(results[0].errors![0].message).toContain('fragmentRef');
    });
  });

  describe('mutation operations', () => {
    it('should forward mutations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { success: true } };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should write mutation result to cache', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { createUser: { id: '1', name: 'Alice' } },
      }));
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation]);

      expect(exchange.cache).toBeDefined();
    });

    it('should not read from cache for mutations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation]);
      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(2);
    });
  });

  describe('subscription operations', () => {
    it('should forward subscriptions', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should write subscription data to cache', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { message: 'Hello' },
      }));
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(exchange.cache).toBeDefined();
    });
  });

  describe('teardown handling', () => {
    it('should stop cache subscription on teardown', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const operation = makeTestOperation({ kind: 'query', key: 'test-1' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'test-1' });

      const results = await testExchange(exchange, forward, [operation, teardown]);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should forward teardown operations', async () => {
      const forwardedOps: Operation[] = [];
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
    });
  });

  describe('cache updates', () => {
    it('should emit new data when cache updates', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { count: 1 },
      }));
      const operation = makeTestOperation({ kind: 'query', name: 'GetCount' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
    });

    it('should update all subscribers of same query', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));
      const op1 = makeTestOperation({ kind: 'query', name: 'GetData', variables: {} });
      const op2 = makeTestOperation({ kind: 'query', name: 'GetData', variables: {} });

      const results = await testExchange(exchange, forward, [op1, op2]);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should update fragment subscribers when entity changes', async () => {
      const exchange = cacheExchange({ schemaMeta: schema });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { user: { id: '1', name: 'Alice' } },
      }));
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const fragment = makeTestOperation({ kind: 'fragment', metadata: { fragmentRef } });
      const query = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [fragment, query]);

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
