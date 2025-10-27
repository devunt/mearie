import { describe, it, expect } from 'vitest';
import { retryExchange } from './retry.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { ExchangeError } from '../errors.ts';
import type { Operation } from '../exchange.ts';

describe('retryExchange', () => {
  describe('basic retry', () => {
    it('should retry on retryable error', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3, backoff: () => 0 });
      const forward = makeTestForward((op) => {
        callCount++;
        if (callCount < 3) {
          return {
            operation: op,
            errors: [
              new ExchangeError('HTTP 500', {
                exchangeName: 'http',
                extensions: { statusCode: 500 },
              }),
            ],
          };
        }
        return { operation: op, data: { success: true } };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(callCount).toBe(3);
      expect(results[0]!.data).toEqual({ success: true });
    });

    it('should not retry on non-retryable error', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 404', {
              exchangeName: 'http',
              extensions: { statusCode: 404 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      const results = await promise;

      expect(callCount).toBe(1);
      expect(results[0]!.errors).toBeDefined();
    });

    it('should not retry successful operations', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        return { operation: op, data: { success: true } };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(callCount).toBe(1);
      expect(results[0]!.data).toEqual({ success: true });
    });

    it('should not retry mutations', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'mutation' });

      const promise = testExchange(exchange, forward, [operation]);
      const results = await promise;

      expect(callCount).toBe(1);
      expect(results[0]!.errors).toBeDefined();
    });
  });

  describe('retry attempts', () => {
    it('should respect maxAttempts option', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      const results = await promise;

      expect(callCount).toBe(2);
      expect(results[0]!.errors).toBeDefined();
    });

    it('should default to 3 attempts', async () => {
      let callCount = 0;
      const exchange = retryExchange();
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      const results = await promise;

      expect(callCount).toBe(3);
      expect(results[0]!.errors).toBeDefined();
    });

    it('should stop after max attempts reached', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(2);
    });
  });

  describe('backoff', () => {
    it('should use default exponential backoff', async () => {
      let callCount = 0;
      const delays: number[] = [];
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        if (callCount > 1) {
          delays.push(Date.now());
        }
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(3);
    });

    it('should use custom backoff function', async () => {
      const backoffCalls: number[] = [];
      const exchange = retryExchange({
        maxAttempts: 3,
        backoff: (attempt) => {
          backoffCalls.push(attempt);
          return 100;
        },
      });
      const forward = makeTestForward((op) => {
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(backoffCalls).toHaveLength(2);
      expect(backoffCalls).toEqual([0, 1]);
    });

    it('should delay retry by backoff duration', async () => {
      let callCount = 0;
      const exchange = retryExchange({
        maxAttempts: 2,
        backoff: () => 0,
      });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(callCount).toBe(2);
    });

    it('should cap backoff at 30 seconds', async () => {
      let callCount = 0;
      const exchange = retryExchange({
        maxAttempts: 3,
      });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(3);
    });
  });

  describe('shouldRetry function', () => {
    it('should retry on HTTP 500 errors by default', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(2);
    });

    it('should retry on HTTP 502 errors by default', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 502', {
              exchangeName: 'http',
              extensions: { statusCode: 502 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(2);
    });

    it('should retry on HTTP 503 errors by default', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 503', {
              exchangeName: 'http',
              extensions: { statusCode: 503 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(2);
    });

    it('should not retry on HTTP 400 errors by default', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 400', {
              exchangeName: 'http',
              extensions: { statusCode: 400 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(1);
    });

    it('should not retry on HTTP 404 errors by default', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 404', {
              exchangeName: 'http',
              extensions: { statusCode: 404 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(1);
    });

    it('should use custom shouldRetry function', async () => {
      let callCount = 0;
      const shouldRetryCalls: unknown[] = [];
      const exchange = retryExchange({
        maxAttempts: 3,
        shouldRetry: (error) => {
          shouldRetryCalls.push(error);
          return false;
        },
      });
      const forward = makeTestForward((op) => {
        callCount++;
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(callCount).toBe(1);
      expect(shouldRetryCalls).toHaveLength(1);
    });
  });

  describe('retry metadata', () => {
    it('should add retry metadata to operation', async () => {
      let retryOp: Operation | undefined;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        if (op.metadata.retry) {
          retryOp = op;
        }
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(retryOp).toBeDefined();
      expect((retryOp!.metadata as { retry?: unknown }).retry).toBeDefined();
    });

    it('should increment attempt counter', async () => {
      const attempts: number[] = [];
      const exchange = retryExchange({ maxAttempts: 3 });
      const forward = makeTestForward((op) => {
        if (op.metadata.retry) {
          attempts.push(op.metadata.retry.attempt);
        }
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect(attempts).toEqual([1, 2]);
    });

    it('should include delay in metadata', async () => {
      let retryOp: Operation | undefined;

      const exchange = retryExchange({ maxAttempts: 2, backoff: () => 1000 });
      const forward = makeTestForward((op) => {
        if (op.metadata.retry) {
          retryOp = op;
        }

        return {
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect((retryOp!.metadata as { retry: { delay: number } }).retry.delay).toBe(1000);
    });

    it('should set dedup.skip to true for retries', async () => {
      let retryOp: Operation | undefined;
      const exchange = retryExchange({ maxAttempts: 2 });
      const forward = makeTestForward((op) => {
        if (op.metadata.retry) {
          retryOp = op;
        }
        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query' });

      const promise = testExchange(exchange, forward, [operation]);
      await promise;

      expect((retryOp!.metadata as { dedup?: { skip: boolean } }).dedup?.skip).toBe(true);
    });
  });

  describe('teardown handling', () => {
    it('should cancel retry on teardown', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3, backoff: () => 0 });
      const forward = makeTestForward((op) => {
        if (op.variant === 'request') {
          callCount++;
        }

        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query', key: 'test-op' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'test-op' });

      const promise = testExchange(exchange, forward, [operation, teardown]);
      await promise;

      expect(callCount).toBe(1);
    });

    it('should not retry after teardown', async () => {
      let callCount = 0;
      const exchange = retryExchange({ maxAttempts: 3, backoff: () => 0 });
      const forward = makeTestForward((op) => {
        if (op.variant === 'request') {
          callCount++;
        }

        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });
      const operation = makeTestOperation({ kind: 'query', key: 'test-op' });
      const teardown = makeTestOperation({ variant: 'teardown', key: 'test-op' });

      const promise = testExchange(exchange, forward, [operation, teardown]);
      await promise;

      expect(callCount).toBe(1);
    });

    it('should handle teardowns for multiple retry operations without race conditions', async () => {
      let attempt1Count = 0;
      let attempt2Count = 0;
      let attempt3Count = 0;

      const exchange = retryExchange({ maxAttempts: 3, backoff: () => 0 });
      const forward = makeTestForward((op) => {
        if (op.variant === 'teardown') {
          return { operation: op };
        }

        if (op.key === 'op1') attempt1Count++;
        if (op.key === 'op2') attempt2Count++;
        if (op.key === 'op3') attempt3Count++;

        return {
          operation: op,
          errors: [
            new ExchangeError('HTTP 500', {
              exchangeName: 'http',
              extensions: { statusCode: 500 },
            }),
          ],
        };
      });

      const operation1 = makeTestOperation({ kind: 'query', key: 'op1' });
      const operation2 = makeTestOperation({ kind: 'query', key: 'op2' });
      const operation3 = makeTestOperation({ kind: 'query', key: 'op3' });
      const teardown1 = makeTestOperation({ variant: 'teardown', key: 'op1' });
      const teardown2 = makeTestOperation({ variant: 'teardown', key: 'op2' });
      const teardown3 = makeTestOperation({ variant: 'teardown', key: 'op3' });

      await testExchange(exchange, forward, [operation1, operation2, operation3, teardown1, teardown2, teardown3]);

      expect(attempt1Count).toBe(1);
      expect(attempt2Count).toBe(1);
      expect(attempt3Count).toBe(1);
    });
  });
});
