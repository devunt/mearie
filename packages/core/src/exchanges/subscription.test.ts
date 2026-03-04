import { describe, it, expect, vi } from 'vitest';
import { subscriptionExchange } from './subscription.ts';
import type { SubscriptionClient } from './subscription.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';
import type { Operation, OperationResult } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { subscribe } from '../stream/sinks/subscribe.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';

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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.subscribe).toHaveBeenCalled();
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.subscribe).not.toHaveBeenCalled();
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.subscribe).toHaveBeenCalledWith(
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.subscribe).toHaveBeenCalledWith(
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.subscribe).toHaveBeenCalledWith(expect.any(Object) as Record<string, unknown>, {
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
    it('should handle client errors and re-subscribe', async () => {
      let subscribeCount = 0;
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        subscribeCount++;
        if (subscribeCount === 1) {
          setTimeout(() => sink.error(new Error('Connection failed')), 0);
        } else {
          setTimeout(() => sink.complete(), 0);
        }
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors![0]!.message).toBe('Connection failed');
      expect(subscribeCount).toBe(2);
    });

    it('should create ExchangeError on error', async () => {
      let subscribeCount = 0;
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        subscribeCount++;
        if (subscribeCount === 1) {
          setTimeout(() => sink.error(new Error('Test error')), 0);
        } else {
          setTimeout(() => sink.complete(), 0);
        }
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(isExchangeError(results[0]!.errors![0]!, 'subscription')).toBe(true);
    });

    it('should re-subscribe after error and receive data', async () => {
      let subscribeCount = 0;
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        subscribeCount++;
        if (subscribeCount === 1) {
          setTimeout(() => sink.error(new Error('Connection lost')), 0);
        } else {
          setTimeout(() => {
            sink.next({ data: { recovered: true } });
            sink.complete();
          }, 0);
        }
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(subscribeCount).toBe(2);
      expect(results).toHaveLength(2);
      expect(results[0]!.errors![0]!.message).toBe('Connection lost');
      expect(results[1]!.data).toEqual({ recovered: true });
    });

    it('should stop re-subscribing on teardown', async () => {
      let subscribeCount = 0;
      const unsubscribeFn = vi.fn();
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        subscribeCount++;
        setTimeout(() => sink.error(new Error('Error')), 0);
        return unsubscribeFn;
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription', key: 'sub-retry' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'sub-retry' });

      await testExchange(exchange, forward, [operation, teardown]);

      expect(subscribeCount).toBe(1);
    });

    it('should catch downstream exceptions in next handler', async () => {
      let nextCallCount = 0;
      const mockClient = makeSubscriptionClient((_payload, sink) => {
        setTimeout(() => {
          sink.next({ data: { count: 1 } });
          sink.next({ data: { count: 2 } });
          sink.complete();
        }, 0);
        return () => {};
      });

      const exchange = subscriptionExchange({ client: mockClient });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results: OperationResult[] = [];
      vi.useFakeTimers();

      const subject = makeSubject<Operation>();

      const unsubscribe = pipe(
        subject.source,
        exchange({ forward, client: null as never }).io,
        subscribe({
          next: (result) => {
            nextCallCount++;
            results.push(result);
            if (nextCallCount === 1) {
              throw new Error('downstream error');
            }
          },
        }),
      );

      subject.next(operation);
      await Promise.resolve();
      subject.complete();
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      unsubscribe();

      expect(nextCallCount).toBe(3);
      expect(results[0]!.data).toEqual({ count: 1 });
      expect(results[1]!.errors).toBeDefined();
      expect(results[1]!.errors![0]!.message).toBe('downstream error');
      expect(results[2]!.data).toEqual({ count: 2 });
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
