import type { Exchange, OperationResult } from '../exchange.ts';
import { GraphQLError, ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';

declare module '../errors.ts' {
  interface ExchangeErrorExtensionsMap {
    http?: {
      statusCode?: number;
    };
  }
}

export type HttpOptions = {
  url: string;
  headers?: HeadersInit;
  mode?: RequestMode;
  credentials?: RequestCredentials;
};

export const httpExchange = (options: HttpOptions): Exchange => {
  const { url, headers, mode, credentials } = options;

  return () => {
    return (ops$) => {
      return pipe(
        ops$,
        mergeMap((op) => {
          if (op.variant === 'teardown') {
            return (sink) => {
              sink.start({ pull: () => {}, cancel: () => {} });
              sink.complete();
            };
          }

          const { artifact, variables } = op;

          const resultPromise = fetch(url, {
            method: 'POST',
            mode,
            credentials,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({
              query: artifact.source,
              variables,
            }),
          })
            .then(async (response): Promise<OperationResult> => {
              if (!response.ok) {
                return {
                  operation: op,
                  errors: [
                    new ExchangeError(`HTTP ${response.status}: ${response.statusText}`, {
                      exchangeName: 'http',
                      extensions: { statusCode: response.status },
                    }),
                  ],
                };
              }

              try {
                const json = (await response.json()) as {
                  data?: unknown;
                  errors?: readonly {
                    message: string;
                    path?: readonly (string | number)[];
                    locations?: readonly { line: number; column: number }[];
                    extensions?: Record<string, unknown>;
                  }[];
                  extensions?: Record<string, unknown>;
                };

                return {
                  operation: op,
                  data: json.data,
                  errors: json.errors?.map(
                    (err) =>
                      new GraphQLError(err.message, {
                        path: err.path,
                        locations: err.locations,
                        extensions: err.extensions,
                      }),
                  ),
                  extensions: json.extensions,
                };
              } catch (error: unknown) {
                return {
                  operation: op,
                  errors: [
                    new ExchangeError(error instanceof Error ? error.message : 'JSON parse error', {
                      exchangeName: 'http',
                      cause: error,
                    }),
                  ],
                };
              }
            })
            .catch((error: unknown) => {
              return {
                operation: op,
                errors: [
                  new ExchangeError(error instanceof Error ? error.message : 'Network error', {
                    exchangeName: 'http',
                    cause: error,
                  }),
                ],
              };
            });

          return (sink) => {
            let cancelled = false;

            sink.start({
              pull: () => {},
              cancel: () => {
                cancelled = true;
              },
            });

            void resultPromise.then((result) => {
              if (!cancelled) {
                sink.next(result);
                sink.complete();
              }
            });
          };
        }),
      );
    };
  };
};
