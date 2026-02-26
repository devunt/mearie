import type { Exchange, OperationResult, RequestOperation } from '../exchange.ts';
import { GraphQLError, ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { filter } from '../stream/operators/filter.ts';
import { fromPromise } from '../stream/sources/from-promise.ts';
import { merge } from '../stream/operators/merge.ts';
import { tap } from '../stream/operators/tap.ts';

declare module '@mearie/core' {
  interface ExchangeErrorExtensionsMap {
    http?: {
      statusCode?: number;
    };
  }
}

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

export type HttpOptions = {
  url: string;
  headers?: HeadersInit;
  mode?: RequestMode;
  credentials?: RequestCredentials;
  fetch?: typeof globalThis.fetch;
};

type ExecuteFetchOptions = {
  url: string;
  fetchFn: typeof globalThis.fetch;
  fetchOptions: { mode?: RequestMode; credentials?: RequestCredentials; headers?: HeadersInit };
  operation: RequestOperation;
  signal: AbortSignal;
};

const executeFetch = async ({
  url,
  fetchFn,
  fetchOptions,
  operation,
  signal,
}: ExecuteFetchOptions): Promise<OperationResult | null> => {
  const { artifact, variables } = operation;

  let response;
  try {
    await Promise.resolve();

    response = await fetchFn(url, {
      method: 'POST',
      mode: fetchOptions.mode,
      credentials: fetchOptions.credentials,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      body: JSON.stringify({
        operationName: artifact.name,
        query: artifact.body,
        variables,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    return {
      operation,
      errors: [
        new ExchangeError(error instanceof Error ? error.message : 'Network error', {
          exchangeName: 'http',
          cause: error,
        }),
      ],
    };
  }

  if (!response.ok) {
    return {
      operation,
      errors: [
        new ExchangeError(`HTTP ${response.status}: ${response.statusText}`, {
          exchangeName: 'http',
          extensions: { statusCode: response.status },
        }),
      ],
    };
  }

  let json;
  try {
    json = (await response.json()) as GraphQLResponse;
  } catch (error) {
    return {
      operation,
      errors: [
        new ExchangeError(error instanceof Error ? error.message : 'JSON parse error', {
          exchangeName: 'http',
          cause: error,
        }),
      ],
    };
  }

  return {
    operation,
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
};

export const httpExchange = (options: HttpOptions): Exchange => {
  const { url, headers, mode, credentials, fetch: fetchFn = globalThis.fetch } = options;

  return ({ forward }) => ({
    name: 'http',
    io: (ops$) => {
      const inflight = new Map<string, AbortController>();

      const fetch$ = pipe(
        ops$,
        filter(
          (op): op is RequestOperation =>
            op.variant === 'request' && (op.artifact.kind === 'query' || op.artifact.kind === 'mutation'),
        ),
        mergeMap((op) => {
          inflight.get(op.key)?.abort();

          const controller = new AbortController();
          inflight.set(op.key, controller);

          return fromPromise(
            executeFetch({
              url,
              fetchFn,
              fetchOptions: { mode, credentials, headers },
              operation: op,
              signal: controller.signal,
            }).then((result) => {
              inflight.delete(op.key);
              return result;
            }),
          );
        }),
        filter((result) => result !== null),
      );

      const forward$ = pipe(
        ops$,
        filter(
          (op) =>
            op.variant === 'teardown' ||
            (op.variant === 'request' && (op.artifact.kind === 'subscription' || op.artifact.kind === 'fragment')),
        ),
        tap((op) => {
          if (op.variant === 'teardown') {
            inflight.get(op.key)?.abort();
            inflight.delete(op.key);
          }
        }),
        forward,
      );

      return merge(fetch$, forward$);
    },
  });
};
