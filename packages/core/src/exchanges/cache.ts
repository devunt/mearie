import type { Artifact, DataOf, SchemaMeta } from '@mearie/shared';
import type { Exchange, RequestOperation, OperationResult } from '../exchange.ts';
import type { CacheNotification, CacheOperations, CacheSnapshot, InvalidateTarget, Patch } from '../cache/types.ts';
import { Cache } from '../cache/cache.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromValue } from '../stream/sources/from-value.ts';
import { merge } from '../stream/operators/merge.ts';
import { ExchangeError } from '../errors.ts';
import { filter } from '../stream/operators/filter.ts';
import { share } from '../stream/operators/share.ts';
import { tap } from '../stream/operators/tap.ts';
import { takeUntil } from '../stream/operators/take-until.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';
import { empty } from '../stream/sources/empty.ts';
import { isFragmentRef, isFragmentRefArray } from '../cache/utils.ts';

declare module '@mearie/core' {
  interface ExchangeExtensionMap<TMeta extends SchemaMeta> {
    cache: CacheOperations<TMeta>;
  }
  interface OperationMetadataMap<T extends Artifact> {
    cache?: {
      optimisticResponse?: T extends Artifact<'mutation'> ? DataOf<T> : never;
    };
  }
  interface OperationResultMetadataMap {
    cache?: { stale?: boolean; patches?: Patch[] };
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
        const subscriptionHasData = new Map<string, boolean>();
        const refetch$ = makeSubject<RequestOperation<'query'>>();

        const fragment$ = pipe(
          ops$,
          filter(
            (op): op is RequestOperation<'fragment'> => op.variant === 'request' && op.artifact.kind === 'fragment',
          ),
          mergeMap((op) => {
            const fragmentRef = op.metadata?.fragment?.ref;

            if (!fragmentRef) {
              return fromValue({
                operation: op,
                errors: [
                  new ExchangeError(
                    'Fragment operation missing fragment.ref in metadata. This usually happens when the wrong fragment reference was passed.',
                    { exchangeName: 'cache' },
                  ),
                ],
              });
            }

            if (isFragmentRefArray(fragmentRef)) {
              const results = makeSubject<OperationResult>();
              const unsubscribes: (() => void)[] = [];

              for (const [index, ref] of fragmentRef.entries()) {
                const listener = (notification: CacheNotification) => {
                  if (notification.type === 'patch') {
                    const indexedPatches: Patch[] = notification.patches.map(
                      (patch) => ({ ...patch, path: [index, ...patch.path] }) as Patch,
                    );
                    results.next({ operation: op, metadata: { cache: { patches: indexedPatches } }, errors: [] });
                  } else {
                    const { data, stale } = cache.readFragments(op.artifact, fragmentRef);
                    if (data !== null && stale) {
                      results.next({
                        operation: op,
                        data,
                        metadata: { cache: { stale: true } },
                        errors: [],
                      });
                    }
                  }
                };

                const { unsubscribe } = cache.subscribeFragment(op.artifact, ref, listener);
                unsubscribes.push(unsubscribe);
              }

              const { data: initialData, stale: initialStale } = cache.readFragments(op.artifact, fragmentRef);

              const teardown$ = pipe(
                ops$,
                filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
                tap(() => {
                  for (const unsub of unsubscribes) unsub();
                  results.complete();
                }),
              );

              const initial = fromValue({
                operation: op,
                data: initialData,
                ...(initialStale && { metadata: { cache: { stale: true } } }),
                errors: [],
              });

              return pipe(merge(initial, results.source), takeUntil(teardown$));
            }

            if (!isFragmentRef(fragmentRef)) {
              return fromValue({
                operation: op,
                data: fragmentRef,
                errors: [],
              });
            }

            const results = makeSubject<OperationResult>();

            const listener = (notification: CacheNotification) => {
              if (notification.type === 'patch') {
                results.next({ operation: op, metadata: { cache: { patches: notification.patches } }, errors: [] });
              } else {
                const { data: staleData, stale: isStale } = cache.readFragment(op.artifact, fragmentRef);
                if (staleData !== null && isStale) {
                  results.next({
                    operation: op,
                    data: staleData,
                    metadata: { cache: { stale: true } },
                    errors: [],
                  });
                }
              }
            };

            const { data, stale, unsubscribe } = cache.subscribeFragment(op.artifact, fragmentRef, listener);

            const teardown$ = pipe(
              ops$,
              filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
              tap(() => {
                unsubscribe();
                results.complete();
              }),
            );

            const initial =
              data === null
                ? empty()
                : fromValue({
                    operation: op,
                    data,
                    ...(stale && { metadata: { cache: { stale: true } } }),
                    errors: [],
                  });

            return pipe(merge(initial, results.source), takeUntil(teardown$));
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
          tap((op) => {
            if (op.artifact.kind === 'mutation' && op.metadata?.cache?.optimisticResponse) {
              cache.writeOptimistic(op.key, op.artifact, op.variables, op.metadata.cache.optimisticResponse);
            }
          }),
        );

        const query$ = pipe(
          ops$,
          filter(
            (op): op is RequestOperation<'query'> =>
              op.variant === 'request' && op.artifact.kind === 'query' && fetchPolicy !== 'network-only',
          ),
          share(),
        );

        const cache$ = pipe(
          query$,
          mergeMap((op) => {
            const results = makeSubject<OperationResult>();

            const listener = (notification: CacheNotification) => {
              if (notification.type === 'patch') {
                if (!subscriptionHasData.get(op.key)) return;
                results.next({
                  operation: op,
                  metadata: { cache: { patches: notification.patches } },
                  errors: [],
                });
              } else {
                const { data: staleData, stale: isStale } = cache.readQuery(op.artifact, op.variables);
                if (isStale) {
                  if (staleData !== null) {
                    results.next({
                      operation: op,
                      data: staleData,
                      metadata: { cache: { stale: true } },
                      errors: [],
                    });
                  }
                  refetch$.next(op);
                }
              }
            };

            const { data, stale, unsubscribe } = cache.subscribeQuery(op.artifact, op.variables, listener);

            subscriptionHasData.set(op.key, data !== null);

            const teardown$ = pipe(
              ops$,
              filter((o) => o.variant === 'teardown' && o.key === op.key),
              tap(() => {
                unsubscribe();
                subscriptionHasData.delete(op.key);
                results.complete();
              }),
            );

            const initial =
              data === null
                ? fetchPolicy === 'cache-only'
                  ? fromValue({ operation: op, data: null, errors: [] as never })
                  : empty()
                : fromValue({
                    operation: op,
                    data,
                    ...(stale && { metadata: { cache: { stale: true } } }),
                    errors: [],
                  });

            const stream$ = pipe(merge(initial, results.source), takeUntil(teardown$));

            if (stale) {
              refetch$.next(op);
            }

            return stream$;
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
          mergeMap((result) => {
            if (
              result.operation.variant === 'request' &&
              result.operation.artifact.kind === 'mutation' &&
              result.operation.metadata?.cache?.optimisticResponse
            ) {
              cache.removeOptimistic(result.operation.key);
            }

            if (result.operation.variant === 'request' && result.data) {
              cache.writeQuery(result.operation.artifact, result.operation.variables, result.data);
            }

            if (
              result.operation.variant !== 'request' ||
              result.operation.artifact.kind !== 'query' ||
              fetchPolicy === 'network-only' ||
              !!(result.errors && result.errors.length > 0)
            ) {
              return fromValue(result);
            }

            const hadData = subscriptionHasData.get(result.operation.key);
            if (hadData) {
              const { data } = cache.readQuery(
                result.operation.artifact as Artifact<'query'>,
                result.operation.variables,
              );
              if (data !== null) {
                return empty();
              }

              return fromValue({
                operation: result.operation,
                data: undefined,
                errors: [
                  new ExchangeError(
                    'Cache failed to denormalize the network response. This is likely a bug in the cache normalizer.',
                    { exchangeName: 'cache' },
                  ),
                ],
              });
            }

            subscriptionHasData.set(result.operation.key, true);

            const { data } = cache.readQuery(
              result.operation.artifact as Artifact<'query'>,
              result.operation.variables,
            );
            if (data !== null) {
              return fromValue({ ...result, data });
            }

            return fromValue({
              operation: result.operation,
              data: undefined,
              errors: [
                new ExchangeError(
                  'Cache failed to denormalize the network response. This is likely a bug in the cache normalizer.',
                  { exchangeName: 'cache' },
                ),
              ],
            });
          }),
        );

        return merge(fragment$, cache$, forward$);
      },
    };
  };
};
