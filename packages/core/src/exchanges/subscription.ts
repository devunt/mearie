import type { Exchange, OperationResult, RequestOperation } from '../exchange.ts';
import { ExchangeError, GraphQLError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { filter } from '../stream/operators/filter.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { merge } from '../stream/operators/merge.ts';
import { takeUntil } from '../stream/operators/take-until.ts';
import { make } from '../stream/sources/make.ts';

type GraphQLResponse = {
  data?: unknown;
  errors?: readonly {
    message: string;
    path?: readonly (string | number)[];
    locations?: readonly { line: number; column: number }[];
    extensions?: Record<string, unknown>;
  }[];
  extensions?: Record<string, unknown>;
};

export interface SubscriptionClient {
  subscribe(
    payload: { query: string; variables?: Record<string, unknown> },
    sink: {
      next: (result: unknown) => void;
      error: (error: unknown) => void;
      complete: () => void;
    },
  ): () => void;
}

export type SubscriptionExchangeOptions = {
  client: SubscriptionClient;
};

/**
 * Creates an exchange for handling GraphQL subscriptions using a subscription client.
 *
 * This exchange accepts subscription clients from graphql-ws, graphql-sse, or any client
 * implementing the Observer pattern.
 * @internal
 * @param options - Configuration options for the subscription exchange.
 * @returns An exchange that handles subscription operations.
 * @example
 * // With graphql-ws
 * import { createClient } from 'graphql-ws';
 *
 * const wsClient = createClient({
 *   url: 'ws://localhost:4000/graphql',
 * });
 *
 * subscriptionExchange({ client: wsClient })
 * @example
 * // With graphql-sse
 * import { createClient } from 'graphql-sse';
 *
 * const sseClient = createClient({
 *   url: 'http://localhost:4000/graphql/stream',
 * });
 *
 * subscriptionExchange({ client: sseClient })
 */
export const subscriptionExchange = (options: SubscriptionExchangeOptions): Exchange => {
  const { client } = options;

  return (forward) => {
    return (ops$) => {
      const subscription$ = pipe(
        ops$,
        filter((op): op is RequestOperation => op.variant === 'request' && op.artifact.kind === 'subscription'),
        mergeMap((op) => {
          const teardown$ = pipe(
            ops$,
            filter((operation) => operation.variant === 'teardown' && operation.key === op.key),
          );

          const source$ = make<OperationResult>((observer) => {
            let unsubscribe: (() => void) | undefined;
            let completed = false;

            void Promise.resolve().then(() => {
              if (completed) return;

              unsubscribe = client.subscribe(
                {
                  query: op.artifact.body,
                  variables: op.variables as Record<string, unknown>,
                },
                {
                  next: (result) => {
                    const response = result as GraphQLResponse;

                    observer.next({
                      operation: op,
                      data: response.data,
                      errors: response.errors?.map(
                        (err) =>
                          new GraphQLError(err.message, {
                            path: err.path,
                            locations: err.locations,
                            extensions: err.extensions,
                          }),
                      ),
                      extensions: response.extensions,
                    });
                  },
                  error: (error) => {
                    observer.next({
                      operation: op,
                      errors: [
                        new ExchangeError(error instanceof Error ? error.message : String(error), {
                          exchangeName: 'subscription',
                          cause: error,
                        }),
                      ],
                    });

                    observer.complete();
                  },
                  complete: observer.complete,
                },
              );
            });

            return () => {
              completed = true;
              unsubscribe?.();
            };
          });

          return pipe(source$, takeUntil(teardown$));
        }),
      );

      const forward$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown' || op.artifact.kind !== 'subscription'),
        forward,
      );

      return merge(subscription$, forward$);
    };
  };
};
