import type { Exchange, RequestOperation } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { filter } from '../stream/operators/filter.ts';
import { merge } from '../stream/operators/merge.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { delay } from '../stream/operators/delay.ts';
import { fromArray } from '../stream/sources/from-array.ts';
import { stringify } from '../utils.ts';
import { fromValue } from '../stream/index.ts';

const makeDedupKey = (op: RequestOperation): string => {
  return `${op.artifact.name}:${stringify(op.variables)}`;
};

declare module '@mearie/core' {
  interface OperationMetadataMap {
    dedup?: {
      skip?: boolean;
    };
  }
}

/**
 * Prevents duplicate in-flight operations by deduplicating requests with identical artifact names and variables.
 *
 * Operations are considered identical if they have the same artifact name and serialized variables.
 * Mutations are never deduplicated. An operation is "in-flight" from when it's first seen until all subscribers tear down.
 *
 * Caveats:
 *
 * 1. Upstream metadata is lost when operations are deduplicated. The result will contain the metadata
 * from the operation that actually went through the pipeline, not from deduplicated operations.
 * This preserves downstream metadata (retry attempts, cache status) but means custom upstream metadata
 * from deduplicated operations will not appear in results.
 * @internal
 * @returns An exchange that deduplicates in-flight operations.
 */
export const dedupExchange = (): Exchange => {
  return ({ forward }) => ({
    name: 'dedup',
    io: (ops$) => {
      const operations = new Map<string, Set<string>>();
      const resolved = new Set<string>();

      const skip$ = pipe(
        ops$,
        filter(
          (op) => op.variant === 'request' && (op.artifact.kind === 'mutation' || op.artifact.kind === 'fragment'),
        ),
      );

      const deduplicate$ = pipe(
        ops$,
        filter(
          (op): op is RequestOperation =>
            op.variant === 'request' && op.artifact.kind !== 'mutation' && op.artifact.kind !== 'fragment',
        ),
        filter((op) => {
          const dedupKey = makeDedupKey(op);
          const isInflight = operations.has(dedupKey) && !resolved.has(dedupKey);

          if (isInflight) {
            operations.get(dedupKey)!.add(op.key);
          } else {
            operations.set(dedupKey, new Set([op.key]));
          }

          if (!isInflight) {
            resolved.delete(dedupKey);
          }

          return (op.metadata.dedup?.skip ?? false) || !isInflight;
        }),
        delay(0),
      );

      const teardown$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown'),
        filter((teardown) => {
          for (const [dedupKey, subs] of operations.entries()) {
            if (subs.delete(teardown.key)) {
              if (subs.size === 0) {
                operations.delete(dedupKey);
                resolved.delete(dedupKey);
                return true;
              }

              return false;
            }
          }

          return true;
        }),
      );

      return pipe(
        merge(skip$, deduplicate$, teardown$),
        forward,
        mergeMap((result) => {
          if (
            result.operation.variant !== 'request' ||
            result.operation.artifact.kind === 'mutation' ||
            result.operation.artifact.kind === 'fragment'
          ) {
            return fromValue(result);
          }

          const dedupKey = makeDedupKey(result.operation);
          resolved.add(dedupKey);
          const subs = operations.get(dedupKey) ?? new Set<string>();

          return fromArray([...subs].map((key) => ({ ...result, operation: { ...result.operation, key } })));
        }),
      );
    },
  });
};
