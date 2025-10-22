import type { Exchange } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { filter } from '../stream/operators/filter.ts';
import { tap } from '../stream/operators/tap.ts';
import { merge } from '../stream/operators/merge.ts';

export const dedupExchange = (): Exchange => {
  return (forward) => {
    return (ops$) => {
      const inFlightKeys = new Set<string>();

      const teardowns$ = pipe(
        ops$,
        filter((operation) => operation.variant === 'teardown'),
        tap((operation) => {
          inFlightKeys.delete(operation.key);
        }),
        forward,
      );

      const forward$ = pipe(
        ops$,
        filter((operation) => operation.variant === 'request' && !inFlightKeys.has(operation.key)),
        tap((operation) => inFlightKeys.add(operation.key)),
        forward,
        tap((result) => inFlightKeys.delete(result.operation.key)),
      );

      return merge(teardowns$, forward$);
    };
  };
};
