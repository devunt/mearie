import { describe, it, expect, vi } from 'vitest';
import { subscriptionExchange } from './subscription.ts';
import type { SubscriptionClient } from './subscription.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';
import type { Operation } from '../exchange.ts';

type SubscriptionClientHandler = (
  payload: unknown,
  sink: {
    next: (value: unknown) => void;
    error: (error: Error) => void;
    complete: () => void;
  },
) => () => void;

const makeSubscriptionClient = (handler?: SubscriptionClientHandler): SubscriptionClient => {
  return {
    subscribe: vi.fn(
      handler ??
        ((_payload, sink: { complete: () => void }) => {
          sink.complete();
          return () => {};
        }),
    ),
  };
};

describe('subscriptionExchange', () => {
  describe('subscription operations', () => {
    it('should handle subscription operation', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => sink.next({ data: { count: 1 } }), 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(mockClient.subscribe.bind(mockClient)).toHaveBeenCalled();
    });

    it('should forward non-subscription operations', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op, data: { test: true } };
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(mockClient.subscribe.bind(mockClient)).not.toHaveBeenCalled();
    });

    it('should forward teardown operations', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0]!.variant).toBe('teardown');
    });
  });

  describe('client integration', () => {
    it('should call client.subscribe with query', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription', name: 'OnMessageAdded' });

      await testExchange(exchange, forward, [operation]);

      expect(mockClient.subscribe.bind(mockClient)).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(String) as string }) as Record<string, unknown>,
        expect.any(Object) as Record<string, unknown>,
      );
    });

    it('should call client.subscribe with variables', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({
        kind: 'subscription',
        variables: { roomId: '123' },
      });

      await testExchange(exchange, forward, [operation]);

      expect(mockClient.subscribe.bind(mockClient)).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { roomId: '123' } }),
        expect.any(Object) as Record<string, unknown>,
      );
    });

    it('should pass observer to client', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(mockClient.subscribe.bind(mockClient)).toHaveBeenCalledWith(expect.any(Object) as Record<string, unknown>, {
        next: expect.any(Function) as () => void,
        error: expect.any(Function) as () => void,
        complete: expect.any(Function) as () => void,
      });
    });
  });

  describe('data handling', () => {
    it('should emit data from subscription', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.next({ data: { message: 'Hello' } });
          sink.complete();
        }, 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.data).toEqual({ message: 'Hello' });
    });

    it('should convert GraphQL errors to error objects', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.next({
            errors: [{ message: 'Subscription error' }],
          });
          sink.complete();
        }, 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors![0]!.message).toBe('Subscription error');
    });

    it('should include extensions from response', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.next({
            data: { test: true },
            extensions: { custom: 'data' },
          });
          sink.complete();
        }, 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.extensions).toEqual({ custom: 'data' });
    });
  });

  describe('error handling', () => {
    it('should handle client errors', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => sink.error(new Error('Connection failed')), 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors![0]!.message).toBe('Connection failed');
    });

    it('should create ExchangeError on error', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => sink.error(new Error('Test error')), 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(isExchangeError(results[0]!.errors![0]!, 'subscription')).toBe(true);
    });

    it('should complete stream on error', async () => {
      let completed = false;
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.error(new Error('Test error'));
        }, 0);
        return () => {
          completed = true;
        };
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(completed).toBe(true);
    });
  });

  describe('subscription lifecycle', () => {
    it('should call unsubscribe on teardown', async () => {
      const unsubscribeFn = vi.fn();
      const mockClient = makeSubscriptionClient(() => {
        return unsubscribeFn;
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription', key: 'sub-1' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'sub-1' });

      await testExchange(exchange, forward, [operation, teardown]);

      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('should complete stream on teardown', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription', key: 'sub-1' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'sub-1' });

      const results = await testExchange(exchange, forward, [operation, teardown]);

      expect(results).toBeDefined();
    });

    it('should handle multiple emissions', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => sink.next({ data: { count: 1 } }), 0);
        setTimeout(() => sink.next({ data: { count: 2 } }), 0);
        setTimeout(() => sink.next({ data: { count: 3 } }), 0);
        setTimeout(() => sink.complete(), 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle completion from client', async () => {
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.next({ data: { final: true } });
          sink.complete();
        }, 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.data).toEqual({ final: true });
    });
  });

  describe('operation filtering', () => {
    it('should not forward subscription operations', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(0);
    });

    it('should forward queries', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
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

    it('should forward mutations', async () => {
      const mockClient = makeSubscriptionClient();

      const exchange = subscriptionExchange({ client: mockClient });
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
  });
});
