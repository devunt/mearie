import type { Exchange, OperationResult } from '../exchange.ts';
import { Cache } from '../cache/cache.ts';
import type { SchemaMeta, Artifact } from '@mearie/shared';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromValue } from '../stream/sources/from-value.ts';
import { merge } from '../stream/operators/merge.ts';

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
      return pipe(
        ops$,
        mergeMap((op) => {
          if (op.variant === 'teardown') {
            return fromValue({ operation: op } as never);
          }

          const { artifact, variables } = op;
          const vars = variables as Record<string, unknown>;

          if (artifact.kind !== 'query' || fetchPolicy === 'network-only') {
            return pipe(
              fromValue(op),
              forward,
              mergeMap((result) => {
                if (result.data) {
                  cache.writeQuery(artifact, vars, result.data);
                }
                return fromValue(result);
              }),
            );
          }

          const cached = cache.readQuery(artifact as Artifact<'query'>, vars);

          if (fetchPolicy === 'cache-only') {
            const result: OperationResult = {
              operation: op,
              data: cached ?? undefined,
            };
            return fromValue(result);
          }

          if (fetchPolicy === 'cache-first') {
            if (cached) {
              const cachedResult: OperationResult = {
                operation: op,
                data: cached,
              };
              return fromValue(cachedResult);
            }

            return pipe(
              fromValue(op),
              forward,
              mergeMap((result) => {
                if (result.data) {
                  cache.writeQuery(artifact, vars, result.data);
                }
                return fromValue(result);
              }),
            );
          }

          if (cached) {
            const cachedResult: OperationResult = {
              operation: op,
              data: cached,
              stale: true,
            };

            const networkResult$ = pipe(
              fromValue(op),
              forward,
              mergeMap((result) => {
                if (result.data) {
                  cache.writeQuery(artifact, vars, result.data);
                }
                return fromValue(result);
              }),
            );

            return merge(fromValue(cachedResult), networkResult$);
          }

          return pipe(
            fromValue(op),
            forward,
            mergeMap((result) => {
              if (result.data) {
                cache.writeQuery(artifact, vars, result.data);
              }
              return fromValue(result);
            }),
          );
        }),
      );
    };
  };

  return Object.assign(exchange, { cache });
};
