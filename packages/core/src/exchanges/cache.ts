import type { Exchange, RequestOperation } from '../exchange.ts';
import { Cache } from '../cache/cache.ts';
import type { SchemaMeta } from '@mearie/shared';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromValue } from '../stream/sources/from-value.ts';
import { merge } from '../stream/operators/merge.ts';
import { ExchangeError } from '../errors.ts';
import { fromSubscription } from '../stream/sources/from-subscription.ts';
import { map } from '../stream/operators/map.ts';
import { filter } from '../stream/operators/filter.ts';
import { share } from '../stream/operators/share.ts';
import { tap } from '../stream/operators/tap.ts';
import { takeUntil } from '../stream/operators/take-until.ts';
import { isFragmentRef } from '../cache/utils.ts';

export type CacheOptions = {
  schemaMeta?: SchemaMeta;
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

export type CacheExchange = {
  cache: Cache;
} & Exchange;

export const cacheExchange = (options: CacheOptions = {}): CacheExchange => {
  const { schemaMeta = { entities: {} }, fetchPolicy = 'cache-first' } = options;
  const cache = new Cache(schemaMeta);

  const exchange: Exchange = (forward) => {
    return (ops$) => {
      const teardowns$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown'),
        share(),
      );

      const fragment$ = pipe(
        ops$,
        filter((op): op is RequestOperation<'fragment'> => op.variant === 'request' && op.artifact.kind === 'fragment'),
        mergeMap((op) => {
          const fragmentRef = op.metadata?.fragmentRef;

          if (!fragmentRef) {
            return fromValue({
              operation: op,
              errors: [
                new ExchangeError(
                  'Fragment operation missing fragmentRef in metadata. This usually happens when the wrong fragment reference was passed.',
                  { exchangeName: 'cache' },
                ),
              ],
            });
          }

          if (!isFragmentRef(fragmentRef)) {
            return fromValue({
              operation: op,
              data: fragmentRef,
              errors: [],
            });
          }

          const teardown$ = pipe(
            teardowns$,
            filter((operation) => operation.key === op.key),
          );

          return pipe(
            fromSubscription(
              () => cache.readFragment(op.artifact, fragmentRef),
              (signal) => cache.subscribeFragment(op.artifact, fragmentRef, signal),
            ),
            takeUntil(teardown$),
            map((data) => ({ operation: op, data, errors: [] })),
          );
        }),
      );

      const nonCache$ = pipe(
        ops$,
        filter(
          (op): op is RequestOperation =>
            op.variant === 'request' &&
            (op.artifact.kind === 'mutation' ||
              op.artifact.kind === 'subscription' ||
              (op.artifact.kind === 'query' && fetchPolicy === 'network-only')),
        ),
      );

      const query$ = pipe(
        ops$,
        filter(
          (op): op is RequestOperation<'query'> =>
            op.variant === 'request' && op.artifact.kind === 'query' && fetchPolicy !== 'network-only',
        ),
      );

      const cache$ = pipe(
        query$,
        mergeMap((op) => {
          const teardown$ = pipe(
            teardowns$,
            filter((operation) => operation.key === op.key),
          );

          return pipe(
            fromSubscription(
              () => cache.readQuery(op.artifact, op.variables),
              (signal) => cache.subscribeQuery(op.artifact, op.variables, signal),
            ),
            takeUntil(teardown$),
            map((data) => ({ operation: op, data, errors: [] })),
          );
        }),
        filter(
          (result) =>
            fetchPolicy === 'cache-only' ||
            (fetchPolicy === 'cache-and-network' && result.data !== null) ||
            (fetchPolicy === 'cache-first' && result.data !== null),
        ),
      );

      const network$ = pipe(
        query$,
        filter((op) => {
          const cached = cache.readQuery(op.artifact, op.variables);
          return fetchPolicy === 'cache-and-network' || cached === null;
        }),
      );

      const forward$ = pipe(
        merge(nonCache$, network$, teardowns$),
        forward,
        tap((result) => {
          if (result.operation.variant === 'request' && result.data) {
            cache.writeQuery(result.operation.artifact, result.operation.variables, result.data);
          }
        }),
        filter(
          (result) =>
            result.operation.variant !== 'request' ||
            result.operation.artifact.kind !== 'query' ||
            fetchPolicy === 'network-only',
        ),
      );

      return merge(fragment$, cache$, forward$);
    };
  };

  return Object.assign(exchange, { cache });
};
