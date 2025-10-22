import type { Exchange, OperationResult, RequestOperation } from '../exchange.ts';
import { GraphQLError, ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { filter } from '../stream/operators/filter.ts';
import { fromPromise } from '../stream/sources/from-promise.ts';
import { merge } from '../stream/operators/merge.ts';

declare module '../errors.ts' {
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
};

const executeFetch = async (
  url: string,
  op: RequestOperation,
  fetchOptions: { mode?: RequestMode; credentials?: RequestCredentials; headers?: HeadersInit },
): Promise<OperationResult> => {
  const { artifact, variables } = op;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      mode: fetchOptions.mode,
      credentials: fetchOptions.credentials,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      body: JSON.stringify({
        query: artifact.source,
        variables,
      }),
    });
  } catch (error) {
    return {
      operation: op,
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
      operation: op,
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
      operation: op,
      errors: [
        new ExchangeError(error instanceof Error ? error.message : 'JSON parse error', {
          exchangeName: 'http',
          cause: error,
        }),
      ],
    };
  }

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
};

export const httpExchange = (options: HttpOptions): Exchange => {
  const { url, headers, mode, credentials } = options;

  return (forward) => {
    return (ops$) => {
      const fetch$ = pipe(
        ops$,
        filter((op): op is RequestOperation => op.variant === 'request' && op.artifact.kind !== 'fragment'),
        mergeMap((op) => fromPromise(executeFetch(url, op, { mode, credentials, headers }))),
      );

      const forward$ = pipe(
        ops$,
        filter((op) => op.variant === 'teardown' || op.artifact.kind !== 'fragment'),
        forward,
      );

      return merge(fetch$, forward$);
    };
  };
};
