import { describe, it, expect } from 'vitest';
import { dedupExchange } from './dedup.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import type { Operation } from '../exchange.ts';

describe('dedupExchange', () => {
  describe('basic deduplication', () => {
    it('should deduplicate identical queries', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });

      const results = await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(1);
      expect(results).toHaveLength(2);
      expect(results[0].data).toEqual({ test: true });
      expect(results[1].data).toEqual({ test: true });
    });

    it('should not deduplicate different queries', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 2 } });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(2);
    });

    it('should not deduplicate mutations', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });

      const op1 = makeTestOperation({ kind: 'mutation', name: 'CreateUser', variables: { name: 'Alice' } });
      const op2 = makeTestOperation({ kind: 'mutation', name: 'CreateUser', variables: { name: 'Alice' } });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(2);
    });
  });

  describe('dedup key generation', () => {
    it('should treat same name and variables as duplicate', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetPosts', variables: { limit: 10 } });
      const op2 = makeTestOperation({ name: 'GetPosts', variables: { limit: 10 } });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should treat different names as different', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: {} });
      const op2 = makeTestOperation({ name: 'GetPost', variables: {} });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(2);
    });

    it('should treat different variables as different', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: '1' } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: '2' } });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(2);
    });

    it('should handle empty variables', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetPosts', variables: {} });
      const op2 = makeTestOperation({ name: 'GetPosts', variables: {} });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(1);
    });
  });

  describe('result distribution', () => {
    it('should send result to all deduplicated operations', async () => {
      const exchange = dedupExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { id: '1', name: 'Alice' },
      }));

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op3 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });

      const results = await testExchange(exchange, forward, [op1, op2, op3]);

      expect(results).toHaveLength(3);
      expect(results[0].data).toEqual({ id: '1', name: 'Alice' });
      expect(results[1].data).toEqual({ id: '1', name: 'Alice' });
      expect(results[2].data).toEqual({ id: '1', name: 'Alice' });
    });

    it('should preserve original operation keys in results', async () => {
      const exchange = dedupExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { test: true },
      }));

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-1' });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-2' });
      const op3 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-3' });

      const results = await testExchange(exchange, forward, [op1, op2, op3]);

      expect(results).toHaveLength(3);
      expect(results[0].operation.key).toBe('op-1');
      expect(results[1].operation.key).toBe('op-2');
      expect(results[2].operation.key).toBe('op-3');
    });
  });

  describe('teardown handling', () => {
    it('should forward teardown when all subscribers torn down', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-1' });
      const teardown1 = makeTestOperation({ variant: 'teardown', key: 'op-1' });

      await testExchange(exchange, forward, [op1, teardown1]);

      const teardowns = forwardedOps.filter((op) => op.variant === 'teardown');
      expect(teardowns).toHaveLength(1);
    });

    it('should not forward teardown while subscribers remain', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-1' });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-2' });
      const teardown1 = makeTestOperation({ variant: 'teardown', key: 'op-1' });

      await testExchange(exchange, forward, [op1, op2, teardown1]);

      const teardowns = forwardedOps.filter((op) => op.variant === 'teardown');
      expect(teardowns).toHaveLength(0);
    });

    it('should track multiple subscribers per operation', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-1' });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-2' });
      const op3 = makeTestOperation({ name: 'GetUser', variables: { id: 1 }, key: 'op-3' });
      const teardown1 = makeTestOperation({ variant: 'teardown', key: 'op-1' });
      const teardown2 = makeTestOperation({ variant: 'teardown', key: 'op-2' });
      const teardown3 = makeTestOperation({ variant: 'teardown', key: 'op-3' });

      await testExchange(exchange, forward, [op1, op2, op3, teardown1, teardown2, teardown3]);

      const teardowns = forwardedOps.filter((op) => op.variant === 'teardown');
      expect(teardowns).toHaveLength(1);
    });
  });

  describe('skip deduplication', () => {
    it('should skip dedup when metadata.dedup.skip is true', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({
        name: 'GetUser',
        variables: { id: 1 },
        metadata: { dedup: { skip: true } },
      });
      const op2 = makeTestOperation({
        name: 'GetUser',
        variables: { id: 1 },
        metadata: { dedup: { skip: true } },
      });

      await testExchange(exchange, forward, [op1, op2]);

      expect(forwardedOps).toHaveLength(2);
    });
  });

  describe('operation forwarding', () => {
    it('should forward only one operation for duplicates', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op3 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });

      await testExchange(exchange, forward, [op1, op2, op3]);

      const requests = forwardedOps.filter((op) => op.variant === 'request');
      expect(requests).toHaveLength(1);
    });

    it('should forward all mutations', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ kind: 'mutation', name: 'CreateUser' });
      const op2 = makeTestOperation({ kind: 'mutation', name: 'CreateUser' });
      const op3 = makeTestOperation({ kind: 'mutation', name: 'CreateUser' });

      await testExchange(exchange, forward, [op1, op2, op3]);

      const mutations = forwardedOps.filter(
        (op) => op.variant === 'request' && 'artifact' in op && op.artifact.kind === 'mutation',
      );
      expect(mutations).toHaveLength(3);
    });

    it('should forward subscriptions', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ kind: 'subscription', name: 'OnUserUpdated' });
      const op2 = makeTestOperation({ kind: 'subscription', name: 'OnUserUpdated' });

      await testExchange(exchange, forward, [op1, op2]);

      const subscriptions = forwardedOps.filter(
        (op) => op.variant === 'request' && 'artifact' in op && op.artifact.kind === 'subscription',
      );
      expect(subscriptions).toHaveLength(1);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed operation types', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const query1 = makeTestOperation({ kind: 'query', name: 'GetUser', variables: { id: 1 } });
      const query2 = makeTestOperation({ kind: 'query', name: 'GetUser', variables: { id: 1 } });
      const mutation = makeTestOperation({ kind: 'mutation', name: 'CreateUser' });
      const subscription = makeTestOperation({ kind: 'subscription', name: 'OnUserUpdated' });

      await testExchange(exchange, forward, [query1, query2, mutation, subscription]);

      expect(forwardedOps).toHaveLength(3);
    });

    it('should handle multiple different operations', async () => {
      const exchange = dedupExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });

      const op1 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op2 = makeTestOperation({ name: 'GetUser', variables: { id: 1 } });
      const op3 = makeTestOperation({ name: 'GetUser', variables: { id: 2 } });
      const op4 = makeTestOperation({ name: 'GetPost', variables: { id: 1 } });

      await testExchange(exchange, forward, [op1, op2, op3, op4]);

      expect(forwardedOps).toHaveLength(3);
    });
  });
});
