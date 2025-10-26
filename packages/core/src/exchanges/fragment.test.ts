import { describe, it, expect } from 'vitest';
import { fragmentExchange } from './fragment.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';
import type { Operation } from '../exchange.ts';

describe('fragmentExchange', () => {
  describe('fragment operations', () => {
    it('should return fragmentRef for fragment operation', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual(fragmentRef);
      expect(results[0]!.errors).toBeUndefined();
    });

    it('should forward non-fragment operations', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ test: true });
    });

    it('should forward teardown operations', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]).toEqual(operation);
    });
  });

  describe('error handling', () => {
    it('should error when fragmentRef missing in metadata', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors).toHaveLength(1);
      expect(results[0]!.data).toBeUndefined();
    });

    it('should include correct error message', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation]);

      const error = results[0]!.errors![0]!;
      expect(error.message).toBe(
        'Fragment operation missing fragmentRef in metadata. This usually happens when the wrong fragment reference was passed.',
      );
    });

    it('should set exchangeName to fragment', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'fragment' });

      const results = await testExchange(exchange, forward, [operation]);

      const error = results[0]!.errors![0]!;
      expect(isExchangeError(error, 'fragment')).toBe(true);
    });
  });

  describe('operation filtering', () => {
    it('should process only fragment operations', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });
      const queryOp = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [fragmentOp, queryOp]);

      expect(results).toHaveLength(2);
      expect(results[0]!.data).toEqual(fragmentRef);
    });

    it('should not call forward for fragment operations', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(0);
    });

    it('should call forward for queries', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]!.variant).toBe('request');
    });

    it('should call forward for mutations', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]!.variant).toBe('request');
    });

    it('should call forward for subscriptions', async () => {
      const exchange = fragmentExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]!.variant).toBe('request');
    });
  });

  describe('fragmentRef types', () => {
    it('should handle fragmentRef with different properties', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const fragmentRef = {
        __key: 'Post:42',
        __typename: 'Post',
        id: '42',
      };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.data).toEqual(fragmentRef);
    });

    it('should handle fragmentRef with null key', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const fragmentRef = { __key: null, __typename: 'User' };
      const operation = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.data).toEqual(fragmentRef);
    });
  });

  describe('multiple operations', () => {
    it('should handle multiple fragment operations', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward();
      const ref1 = { __key: 'User:1', __typename: 'User' };
      const ref2 = { __key: 'Post:1', __typename: 'Post' };
      const op1 = makeTestOperation({ kind: 'fragment', metadata: { fragmentRef: ref1 } });
      const op2 = makeTestOperation({ kind: 'fragment', metadata: { fragmentRef: ref2 } });

      const results = await testExchange(exchange, forward, [op1, op2]);

      expect(results).toHaveLength(2);
      expect(results[0]!.data).toEqual(ref1);
      expect(results[1]!.data).toEqual(ref2);
    });

    it('should handle mixed operations', async () => {
      const exchange = fragmentExchange();
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { forwarded: true },
      }));
      const fragmentRef = { __key: 'User:1', __typename: 'User' };
      const fragmentOp = makeTestOperation({
        kind: 'fragment',
        metadata: { fragmentRef },
      });
      const queryOp = makeTestOperation({ kind: 'query' });
      const teardownOp = makeTestOperation({ variant: 'teardown' });

      const results = await testExchange(exchange, forward, [fragmentOp, queryOp, teardownOp]);

      expect(results).toHaveLength(3);
      expect(results[0]!.data).toEqual(fragmentRef);
      expect(results[1]!.data).toEqual({ forwarded: true });
      expect(results[2]!.data).toEqual({ forwarded: true });
    });
  });
});
