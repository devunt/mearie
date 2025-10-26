import type { Operation, OperationResult, ExchangeIO, Exchange, RequestOperation } from '../exchange.ts';
import type { ArtifactKind, Artifact, Selection } from '@mearie/shared';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';
import { vi } from 'vitest';
import { subscribe } from '../stream/sinks/subscribe.ts';
import type { Source } from '../stream/types.ts';

let operationCounter = 0;

export type TestOperationOptions = {
  variant?: 'request' | 'teardown';
  kind?: ArtifactKind;
  name?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  key?: string;
  selections?: readonly Selection[];
};

export const makeTestOperation = (options: TestOperationOptions = {}): Operation => {
  const {
    variant = 'request',
    kind = 'query',
    name = `TestOperation${operationCounter}`,
    variables = {},
    metadata = {},
    key = `op-${++operationCounter}`,
    selections = [],
  } = options;

  const artifact: Artifact = {
    kind,
    name,
    body: '',
    selections,
  };

  if (variant === 'teardown') {
    return {
      variant: 'teardown',
      key,
      artifact,
      metadata,
    };
  }

  return {
    variant: 'request',
    key,
    metadata,
    artifact,
    variables,
  } as RequestOperation;
};

export type ForwardHandler = (operation: Operation) => Partial<OperationResult>;

export const makeTestForward = (handler?: ForwardHandler): ExchangeIO => {
  return (ops$) =>
    pipe(
      ops$,
      map((op): OperationResult => {
        if (handler) {
          const result = handler(op);
          return {
            operation: op,
            data: result.data,
            errors: result.errors,
            extensions: result.extensions,
            stale: result.stale,
          };
        } else {
          return { operation: op };
        }
      }),
    );
};

export const fromArrayMicrotick = <T>(values: T[]): Source<T> => {
  return (sink) => {
    let cancelled = false;
    let index = 0;

    const next = () => {
      if (cancelled) {
        return;
      }

      if (index >= values.length) {
        sink.complete();
        return;
      }

      sink.next(values[index++]!);
      queueMicrotask(() => next());
    };

    next();

    return {
      unsubscribe() {
        cancelled = true;
      },
    };
  };
};

export const testExchange = async (
  exchange: Exchange,
  forward: ExchangeIO,
  operations: Operation[],
): Promise<OperationResult[]> => {
  const results: OperationResult[] = [];
  vi.useFakeTimers();

  const unsubscribe = pipe(
    fromArrayMicrotick(operations),
    exchange(forward),
    subscribe({
      next: (result) => {
        results.push(result);
      },
    }),
  );

  await vi.runAllTimersAsync();
  vi.useRealTimers();
  unsubscribe();

  return results;
};
