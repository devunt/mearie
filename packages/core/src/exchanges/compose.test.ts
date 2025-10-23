import { describe, it, expect } from 'vitest';
import { composeExchange } from './compose.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import type { Exchange, Operation } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';
import { filter } from '../stream/operators/filter.ts';
import { merge } from '../stream/operators/merge.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromArray } from '../stream/sources/from-array.ts';
import { subscribe } from '../stream/sinks/subscribe.ts';

describe('composeExchange', () => {
  describe('basic composition', () => {
    it('should compose single exchange', async () => {
      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({ ...result, data: { value: 1 } })),
        );

      const composed = composeExchange({ exchanges: [exchange1] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(composed, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual({ value: 1 });
    });

    it('should compose two exchanges', async () => {
      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, first: true },
          })),
        );

      const exchange2: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, second: true },
          })),
        );

      const composed = composeExchange({ exchanges: [exchange1, exchange2] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(composed, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual({ first: true, second: true });
    });

    it('should compose three exchanges', async () => {
      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, first: true },
          })),
        );

      const exchange2: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, second: true },
          })),
        );

      const exchange3: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, third: true },
          })),
        );

      const composed = composeExchange({ exchanges: [exchange1, exchange2, exchange3] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(composed, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual({ first: true, second: true, third: true });
    });

    it('should handle empty exchanges array', async () => {
      const composed = composeExchange({ exchanges: [] });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { empty: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(composed, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual({ empty: true });
    });
  });

  describe('execution order', () => {
    it('should apply exchanges in correct order', async () => {
      const order: number[] = [];

      const exchange1: Exchange = (forward) => (ops$) => {
        order.push(1);
        return pipe(ops$, forward);
      };

      const exchange2: Exchange = (forward) => (ops$) => {
        order.push(2);
        return pipe(ops$, forward);
      };

      const exchange3: Exchange = (forward) => (ops$) => {
        order.push(3);
        return pipe(ops$, forward);
      };

      const composed = composeExchange({ exchanges: [exchange1, exchange2, exchange3] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should pass operations through exchange chain', async () => {
      const operationsSeen: Operation[][] = [[], [], []];

      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => {
            if (op.variant === 'request') {
              operationsSeen[0].push(op);
            }
            return op;
          }),
          forward,
        );

      const exchange2: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => {
            if (op.variant === 'request') {
              operationsSeen[1].push(op);
            }
            return op;
          }),
          forward,
        );

      const exchange3: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => {
            if (op.variant === 'request') {
              operationsSeen[2].push(op);
            }
            return op;
          }),
          forward,
        );

      const composed = composeExchange({ exchanges: [exchange1, exchange2, exchange3] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(operationsSeen[0]).toHaveLength(1);
      expect(operationsSeen[1]).toHaveLength(1);
      expect(operationsSeen[2]).toHaveLength(1);
      expect(operationsSeen[0][0]).toEqual(operation);
      expect(operationsSeen[1][0]).toEqual(operation);
      expect(operationsSeen[2][0]).toEqual(operation);
    });

    it('should allow each exchange to transform operations', async () => {
      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => ({ ...op, metadata: { ...op.metadata, ex1: true } })),
          forward,
        );

      const exchange2: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => ({ ...op, metadata: { ...op.metadata, ex2: true } })),
          forward,
        );

      const composed = composeExchange({ exchanges: [exchange1, exchange2] });

      let finalOperation: Operation | undefined;
      const forward = makeTestForward((op) => {
        finalOperation = op;
        return { operation: op };
      });

      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(finalOperation?.metadata.ex1).toBe(true);
      expect(finalOperation?.metadata.ex2).toBe(true);
    });
  });

  describe('forward function', () => {
    it('should pass forward to innermost exchange', async () => {
      let forwardCallCount = 0;

      const exchange1: Exchange = (forward) => (ops$) => {
        forwardCallCount++;
        return pipe(ops$, forward);
      };

      const composed = composeExchange({ exchanges: [exchange1] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(forwardCallCount).toBe(1);
    });

    it('should call forward from last exchange in chain', async () => {
      let lastForwardCalled = false;

      const exchange1: Exchange = (forward) => (ops$) => pipe(ops$, forward);

      const exchange2: Exchange = (forward) => (ops$) => pipe(ops$, forward);

      const composed = composeExchange({ exchanges: [exchange1, exchange2] });
      const forward = makeTestForward(() => {
        lastForwardCalled = true;
        return {};
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(lastForwardCalled).toBe(true);
    });
  });

  describe('result flow', () => {
    it('should allow exchanges to modify results on the way back', async () => {
      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, modified1: true },
          })),
        );

      const exchange2: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          forward,
          map((result) => ({
            ...result,
            data: { ...result.data, modified2: true },
          })),
        );

      const composed = composeExchange({ exchanges: [exchange1, exchange2] });
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { original: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(composed, forward, [operation]);

      expect(results[0].data).toEqual({
        original: true,
        modified2: true,
        modified1: true,
      });
    });
  });

  describe('share() isolation', () => {
    it('should isolate upstream exchanges from downstream multiple subscriptions (input share)', async () => {
      let exchange1ExecutionCount = 0;

      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => {
            exchange1ExecutionCount++;
            return op;
          }),
          forward,
        );

      const exchange2: Exchange = (forward) => (ops$) => {
        const stream1$ = pipe(ops$, forward);
        const stream2$ = pipe(ops$, forward);
        const stream3$ = pipe(ops$, forward);

        return pipe(
          ops$,
          mergeMap(() => merge(stream1$, stream2$, stream3$)),
        );
      };

      const composed = composeExchange({ exchanges: [exchange1, exchange2] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(composed, forward, [operation]);

      expect(exchange1ExecutionCount).toBe(1);
    });

    it('should isolate exchanges from multiple result subscribers (output share)', async () => {
      let exchange1ExecutionCount = 0;

      const exchange1: Exchange = (forward) => (ops$) =>
        pipe(
          ops$,
          map((op) => {
            exchange1ExecutionCount++;
            return op;
          }),
          forward,
        );

      const composed = composeExchange({ exchanges: [exchange1] });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results: Operation[][] = [[], [], []];

      const ops$ = fromArray([operation]);
      const composed$ = composed(forward)(ops$);

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            results[0].push(result.operation);
          },
        }),
      );

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            results[1].push(result.operation);
          },
        }),
      );

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            results[2].push(result.operation);
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(exchange1ExecutionCount).toBe(1);
      expect(results[0]).toHaveLength(1);
      expect(results[1]).toHaveLength(1);
      expect(results[2]).toHaveLength(1);
    });
  });
});
