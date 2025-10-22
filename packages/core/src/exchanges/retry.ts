import type { Exchange, Operation } from '../exchange.ts';
import { makeOperation } from '../exchange.ts';
import { type OperationError, isExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { filter } from '../stream/operators/filter.ts';
import { takeUntil } from '../stream/operators/take-until.ts';
import { delay } from '../stream/operators/delay.ts';
import { fromValue } from '../stream/sources/from-value.ts';
import { merge } from '../stream/operators/merge.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';

declare module '../exchange.ts' {
  interface OperationMetadataMap {
    retry?: {
      attempt: number;
      delay: number;
    };
  }
}

const defaultShouldRetry = (error: OperationError): boolean =>
  isExchangeError(error, 'http') && error.extensions?.statusCode !== undefined && error.extensions.statusCode >= 500;

export type RetryOptions = {
  maxAttempts?: number;
  backoff?: (attempt: number) => number;
  shouldRetry?: (error: OperationError) => boolean;
};

export const retryExchange = (options: RetryOptions = {}): Exchange => {
  const {
    maxAttempts = 3,
    backoff = (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    shouldRetry = defaultShouldRetry,
  } = options;

  return (forward) => {
    return (ops$) => {
      const { source: retries$, next } = makeSubject<Operation>();

      const teardowns$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown'),
      );

      const retriesDelayed$ = pipe(
        retries$,
        mergeMap((op) => {
          const teardown$ = pipe(
            teardowns$,
            filter((teardown) => teardown.variant === 'teardown' && teardown.key === op.key),
          );

          return pipe(fromValue(op), delay(op.metadata.retry!.delay), takeUntil(teardown$));
        }),
      );

      return pipe(
        merge(ops$, retriesDelayed$),
        filter((op) => op.variant === 'request'),
        forward,
        filter((result) => {
          if (!result.errors || result.errors.length === 0) {
            return true;
          }

          const attempt = result.operation.metadata.retry?.attempt ?? 0;

          if (attempt >= maxAttempts - 1) {
            return true;
          }

          if (!result.errors.some((error) => shouldRetry(error))) {
            return true;
          }

          const operation = makeOperation(result.operation, {
            retry: {
              attempt: attempt + 1,
              delay: backoff(attempt),
            },
          });

          next(operation);

          return false;
        }),
      );
    };
  };
};
