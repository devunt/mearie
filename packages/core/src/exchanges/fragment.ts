import type { Exchange } from '../exchange.ts';
import { ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { filter } from '../stream/operators/filter.ts';
import { map } from '../stream/operators/map.ts';
import { merge } from '../stream/operators/merge.ts';

declare module '@mearie/core' {
  interface OperationMetadataMap {
    fragment?: {
      ref?: unknown;
    };
  }
}

export const fragmentExchange = (): Exchange => {
  return ({ forward }) => ({
    name: 'fragment',
    io: (ops$) => {
      const fragment$ = pipe(
        ops$,
        filter((op) => op.variant === 'request' && op.artifact.kind === 'fragment'),
        map((op) => {
          const fragmentRef = op.metadata.fragment?.ref;

          if (!fragmentRef) {
            return {
              operation: op,
              errors: [
                new ExchangeError(
                  'Fragment operation missing fragment.ref in metadata. This usually happens when the wrong fragment reference was passed.',
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
    },
  });
};
