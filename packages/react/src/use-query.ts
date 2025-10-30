import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artifact, DataOf, QueryOptions, VariablesOf } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type Query<T extends Artifact<'query'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      refetch: () => void;
    };

export type UseQueryOptions = QueryOptions & {
  skip?: boolean;
};

export const useQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends Record<string, never>
    ? [undefined?, UseQueryOptions?]
    : [VariablesOf<T>, UseQueryOptions?]
): Query<T> => {
  const client = useClient();

  const [data, setData] = useState<DataOf<T> | undefined>();
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<AggregatedError | undefined>();

  const unsubscribe = useRef<(() => void) | null>(null);
  const stableVariables = useMemo(() => stringify(variables), [variables]);
  const stableOptions = useMemo(() => options, [options?.skip]);

  const execute = useCallback(() => {
    unsubscribe.current?.();

    if (stableOptions?.skip) {
      return;
    }

    setLoading(true);
    setError(undefined);

    unsubscribe.current = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, variables, stableOptions),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            setError(new AggregatedError(result.errors));
            setLoading(false);
          } else {
            setData(result.data as DataOf<T>);
            setLoading(false);
            setError(undefined);
          }
        },
      }),
    );
  }, [client, query, stableVariables, stableOptions]);

  useEffect(() => {
    execute();
    return () => unsubscribe.current?.();
  }, [execute]);

  return {
    data,
    loading,
    error,
    refetch: execute,
  } as Query<T>;
};
