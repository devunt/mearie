import { describe, it, expect, vi } from 'vitest';
import { composeExchanges } from './compose.ts';
import { makeTestOperation, makeTestForward } from './exchanges/test-utils.ts';
import type { Exchange, ExchangeIO, Operation, OperationResult, ExchangeResult } from './exchange.ts';
import { pipe } from './stream/pipe.ts';
import { map } from './stream/operators/map.ts';
import { merge } from './stream/operators/merge.ts';
import { mergeMap } from './stream/operators/merge-map.ts';
import { subscribe } from './stream/sinks/subscribe.ts';
import { makeSubject } from './stream/sources/make-subject.ts';

const testComposed = async (
  exchanges: Exchange[],
  forward: ExchangeIO,
  operations: Operation[],
): Promise<OperationResult[]> => {
  const results: OperationResult[] = [];
  vi.useFakeTimers();

  const { io } = composeExchanges({ exchanges }, { forward, client: null as never });

  const subject = makeSubject<Operation>();

  const unsubscribe = pipe(
    subject.source,
    io,
    subscribe({
      next: (result) => {
        results.push(result);
      },
    }),
  );

  for (const operation of operations) {
    subject.next(operation);
    await Promise.resolve();
  }

  subject.complete();

  await vi.runAllTimersAsync();
  vi.useRealTimers();

  unsubscribe();

  return results;
};

describe('composeExchanges', () => {
  describe('basic composition', () => {
    it('should compose single exchange', async () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({ ...result, data: { value: 1 } })),
          ),
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testComposed([exchange1], forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ value: 1 });
    });

    it('should compose two exchanges', async () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), first: true },
            })),
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), second: true },
            })),
          ),
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testComposed([exchange1, exchange2], forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ first: true, second: true });
    });

    it('should compose three exchanges', async () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), first: true },
            })),
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), second: true },
            })),
          ),
      });

      const exchange3: Exchange = ({ forward }) => ({
        name: 'exchange3',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), third: true },
            })),
          ),
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testComposed([exchange1, exchange2, exchange3], forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ first: true, second: true, third: true });
    });

    it('should handle empty exchanges array', async () => {
      const forward = makeTestForward((op) => ({
        operation: op,
        data: { empty: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testComposed([], forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ empty: true });
    });
  });

  describe('execution order', () => {
    it('should apply exchanges in correct order', async () => {
      const order: number[] = [];

      const exchange1: Exchange = ({ forward }) => {
        order.push(1);
        return {
          name: 'exchange1',
          io: (ops$) => pipe(ops$, forward),
        };
      };

      const exchange2: Exchange = ({ forward }) => {
        order.push(2);
        return {
          name: 'exchange2',
          io: (ops$) => pipe(ops$, forward),
        };
      };

      const exchange3: Exchange = ({ forward }) => {
        order.push(3);
        return {
          name: 'exchange3',
          io: (ops$) => pipe(ops$, forward),
        };
      };

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1, exchange2, exchange3], forward, [operation]);

      expect(order).toEqual([3, 2, 1]);
    });

    it('should pass operations through exchange chain', async () => {
      const operationsSeen: Operation[][] = [[], [], []];

      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => {
              if (op.variant === 'request') {
                operationsSeen[0]!.push(op);
              }
              return op;
            }),
            forward,
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => {
              if (op.variant === 'request') {
                operationsSeen[1]!.push(op);
              }
              return op;
            }),
            forward,
          ),
      });

      const exchange3: Exchange = ({ forward }) => ({
        name: 'exchange3',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => {
              if (op.variant === 'request') {
                operationsSeen[2]!.push(op);
              }
              return op;
            }),
            forward,
          ),
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1, exchange2, exchange3], forward, [operation]);

      expect(operationsSeen[0]).toHaveLength(1);
      expect(operationsSeen[1]).toHaveLength(1);
      expect(operationsSeen[2]).toHaveLength(1);
      expect(operationsSeen[0]![0]!).toEqual(operation);
      expect(operationsSeen[1]![0]!).toEqual(operation);
      expect(operationsSeen[2]![0]!).toEqual(operation);
    });

    it('should allow each exchange to transform operations', async () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => ({ ...op, metadata: { ...op.metadata, ex1: true } })),
            forward,
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => ({ ...op, metadata: { ...op.metadata, ex2: true } })),
            forward,
          ),
      });

      let finalOperation: Operation | undefined;
      const forward = makeTestForward((op) => {
        finalOperation = op;
        return { operation: op };
      });

      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1, exchange2], forward, [operation]);

      expect(finalOperation?.metadata.ex1).toBe(true);
      expect(finalOperation?.metadata.ex2).toBe(true);
    });
  });

  describe('forward function', () => {
    it('should pass forward to innermost exchange', async () => {
      let forwardCallCount = 0;

      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) => {
          forwardCallCount++;
          return pipe(ops$, forward);
        },
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1], forward, [operation]);

      expect(forwardCallCount).toBe(1);
    });

    it('should call forward from last exchange in chain', async () => {
      let lastForwardCalled = false;

      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) => pipe(ops$, forward),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) => pipe(ops$, forward),
      });

      const forward = makeTestForward(() => {
        lastForwardCalled = true;
        return {};
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1, exchange2], forward, [operation]);

      expect(lastForwardCalled).toBe(true);
    });
  });

  describe('result flow', () => {
    it('should allow exchanges to modify results on the way back', async () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), modified1: true },
            })),
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) =>
          pipe(
            ops$,
            forward,
            map((result) => ({
              ...result,
              data: { ...(result.data as object | undefined), modified2: true },
            })),
          ),
      });

      const forward = makeTestForward((op) => ({
        operation: op,
        data: { original: true },
      }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testComposed([exchange1, exchange2], forward, [operation]);

      expect(results[0]!.data).toEqual({
        original: true,
        modified2: true,
        modified1: true,
      });
    });
  });

  describe('share() isolation', () => {
    it('should isolate upstream exchanges from downstream multiple subscriptions (input share)', async () => {
      let exchange1ExecutionCount = 0;

      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => {
              exchange1ExecutionCount++;
              return op;
            }),
            forward,
          ),
      });

      const exchange2: Exchange = ({ forward }) => ({
        name: 'exchange2',
        io: (ops$) => {
          const stream1$ = pipe(ops$, forward);
          const stream2$ = pipe(ops$, forward);
          const stream3$ = pipe(ops$, forward);

          return pipe(
            ops$,
            mergeMap(() => merge(stream1$, stream2$, stream3$)),
          );
        },
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testComposed([exchange1, exchange2], forward, [operation]);

      expect(exchange1ExecutionCount).toBe(1);
    });

    it('should isolate exchanges from multiple result subscribers (output share)', () => {
      let exchange1ExecutionCount = 0;

      const exchange1: Exchange = ({ forward }) => ({
        name: 'exchange1',
        io: (ops$) =>
          pipe(
            ops$,
            map((op) => {
              exchange1ExecutionCount++;
              return op;
            }),
            forward,
          ),
      });

      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const resultSets: Operation[][] = [[], [], []];

      const { io } = composeExchanges({ exchanges: [exchange1] }, { forward, client: null as never });

      const subject = makeSubject<Operation>();
      const composed$ = io(subject.source);

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            resultSets[0]!.push(result.operation);
          },
        }),
      );

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            resultSets[1]!.push(result.operation);
          },
        }),
      );

      pipe(
        composed$,
        subscribe({
          next: (result) => {
            resultSets[2]!.push(result.operation);
          },
        }),
      );

      subject.next(operation);
      subject.complete();

      expect(exchange1ExecutionCount).toBe(1);
      expect(resultSets[0]).toHaveLength(1);
      expect(resultSets[1]).toHaveLength(1);
      expect(resultSets[2]).toHaveLength(1);
    });
  });

  describe('extensions', () => {
    it('should collect extensions from exchanges', () => {
      const cacheState = { entries: new Map() };

      const exchange1: Exchange = ({ forward }) =>
        ({
          name: 'cache',
          io: (ops$: Parameters<ExchangeIO>[0]) => pipe(ops$, forward),
          extension: cacheState,
        }) as ExchangeResult;

      const exchange2: Exchange = ({ forward }) => ({
        name: 'http',
        io: (ops$) => pipe(ops$, forward),
      });

      const forward = makeTestForward();

      const { extensions } = composeExchanges(
        { exchanges: [exchange1, exchange2] },
        { forward, client: null as never },
      );

      expect(extensions.size).toBe(1);
      expect(extensions.get('cache')).toBe(cacheState);
    });

    it('should not include exchanges without extensions', () => {
      const exchange1: Exchange = ({ forward }) => ({
        name: 'dedup',
        io: (ops$) => pipe(ops$, forward),
      });

      const forward = makeTestForward();

      const { extensions } = composeExchanges({ exchanges: [exchange1] }, { forward, client: null as never });

      expect(extensions.size).toBe(0);
    });
  });
});
