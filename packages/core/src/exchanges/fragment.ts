import type { Exchange } from '../exchange.ts';
import { ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { filter } from '../stream/operators/filter.ts';
import { map } from '../stream/operators/map.ts';
import { merge } from '../stream/operators/merge.ts';

declare module '../exchange.ts' {
  interface OperationMetadataMap {
    fragmentRef?: unknown;
  }
}

export const fragmentExchange = (): Exchange => {
  return (forward) => {
    return (ops$) => {
      const fragment$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'fragment'),
        map((op) => {
          const fragmentRef = op.metadata.fragmentRef;

          if (!fragmentRef) {
            return {
              operation: op,
              errors: [
                new ExchangeError(
                  'Fragment operation missing fragmentRef in metadata. This usually happens when the wrong fragment reference was passed.',
                  {
                    exchangeName: 'fragment',
                  },
                ),
              ],
            };
          }

          return {
            operation: op,
            data: fragmentRef,
          };
        }),
      );

      const forward$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown' || op.artifact.kind !== 'fragment'),
        forward,
      );

      return merge(fragment$, forward$);
    };
  };
};
