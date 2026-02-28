import type { SchemaMeta } from '@mearie/shared';
import type { Exchange, RequestOperation } from '../exchange.ts';
import type { CacheOperations, CacheSnapshot, InvalidateTarget } from '../cache/types.ts';
import { Cache } from '../cache/cache.ts';
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
import { switchMap } from '../stream/operators/switch-map.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';
import { empty } from '../stream/sources/empty.ts';
import { isFragmentRef, isFragmentRefArray } from '../cache/utils.ts';

declare module '@mearie/core' {
  interface ExchangeExtensionMap<TMeta extends SchemaMeta> {
    cache: CacheOperations<TMeta>;
  }
  interface OperationResultMetadataMap {
    cache?: { stale: boolean };
  }
}

export type CacheOptions = {
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

export const cacheExchange = (options: CacheOptions = {}): Exchange<'cache'> => {
  const { fetchPolicy = 'cache-first' } = options;

  return ({ forward, client }) => {
    const cache = new Cache(client.schema);

    return {
      name: 'cache',
      extension: {
        extract: () => cache.extract(),
        hydrate: (snapshot: CacheSnapshot) => cache.hydrate(snapshot),
        invalidate: (...targets: InvalidateTarget[]) => cache.invalidate(...targets),
        clear: () => cache.clear(),
      },
      io: (ops$) => {
        const fragment$ = pipe(
          ops$,
          filter(
            (op): op is RequestOperation<'fragment'> => op.variant === 'request' && op.artifact.kind === 'fragment',
          ),
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

            if (isFragmentRefArray(fragmentRef)) {
              const trigger = makeSubject<void>();

              const teardown$ = pipe(
                ops$,
                filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
                tap(() => trigger.complete()),
              );

              return pipe(
                // eslint-disable-next-line unicorn/no-useless-undefined
                merge(fromValue(undefined), trigger.source),
                switchMap(() =>
                  fromSubscription(
                    () => cache.readFragments(op.artifact, fragmentRef),
                    () =>
                      cache.subscribeFragments(op.artifact, fragmentRef, async () => {
                        await Promise.resolve();
                        trigger.next();
                      }),
                  ),
                ),
                takeUntil(teardown$),
                map(({ data, stale }) => ({
                  operation: op,
                  data,
                  ...(stale && { metadata: { cache: { stale: true } } }),
                  errors: [],
                })),
              );
            }

            if (!isFragmentRef(fragmentRef)) {
              return fromValue({
                operation: op,
                data: fragmentRef,
                errors: [],
              });
            }

            const trigger = makeSubject<void>();

            const teardown$ = pipe(
              ops$,
              filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
              tap(() => trigger.complete()),
            );

            return pipe(
              // eslint-disable-next-line unicorn/no-useless-undefined
              merge(fromValue(undefined), trigger.source),
              switchMap(() =>
                fromSubscription(
                  () => cache.readFragment(op.artifact, fragmentRef),
                  () =>
                    cache.subscribeFragment(op.artifact, fragmentRef, async () => {
                      await Promise.resolve();
                      trigger.next();
                    }),
                ),
              ),
              takeUntil(teardown$),
              map(({ data, stale }) => ({
                operation: op,
                data,
                ...(stale && { metadata: { cache: { stale: true } } }),
                errors: [],
              })),
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
          share(),
        );

        const refetch$ = makeSubject<RequestOperation<'query'>>();

        const cache$ = pipe(
          query$,
          mergeMap((op) => {
            const trigger = makeSubject<void>();
            let hasData = false;

            const teardown$ = pipe(
              ops$,
              filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
              tap(() => trigger.complete()),
            );

            return pipe(
              // eslint-disable-next-line unicorn/no-useless-undefined
              merge(fromValue(undefined), trigger.source),
              switchMap(() =>
                fromSubscription(
                  () => cache.readQuery(op.artifact, op.variables),
                  () =>
                    cache.subscribeQuery(op.artifact, op.variables, async () => {
                      await Promise.resolve();
                      trigger.next();
                    }),
                ),
              ),
              takeUntil(teardown$),
              mergeMap(({ data, stale }) => {
                if (data !== null && !stale) {
                  hasData = true;
                  return fromValue({ operation: op, data, errors: [] });
                }

                if (data !== null && stale) {
                  hasData = true;
                  refetch$.next(op);
                  return fromValue({ operation: op, data, metadata: { cache: { stale: true } }, errors: [] });
                }

                if (hasData) {
                  refetch$.next(op);
                  return empty();
                }

                if (fetchPolicy === 'cache-only') {
                  return fromValue({ operation: op, data: null, errors: [] as never });
                }

                return empty();
              }),
            );
          }),
          filter(
            () => fetchPolicy === 'cache-only' || fetchPolicy === 'cache-and-network' || fetchPolicy === 'cache-first',
          ),
        );

        const network$ = pipe(
          query$,
          filter((op) => {
            const { data } = cache.readQuery(op.artifact, op.variables);
            return fetchPolicy === 'cache-and-network' || data === null;
          }),
        );

        const teardown$ = pipe(
          ops$,
          filter((op) => op.variant === 'teardown'),
        );

        const forward$ = pipe(
          merge(nonCache$, network$, teardown$, refetch$.source),
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
              fetchPolicy === 'network-only' ||
              !!(result.errors && result.errors.length > 0),
          ),
        );

        return merge(fragment$, cache$, forward$);
      },
    };
  };
};
