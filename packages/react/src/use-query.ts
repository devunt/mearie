import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artifact, DataOf, OperationResult, QueryOptions, VariablesOf } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type UseQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: DataOf<T>;
      loading: true;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

type UseQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: VariablesOf<T> | undefined,
    options: UseQueryOptions<T> & { initialData: DataOf<T> },
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, UseQueryOptions<T>?]
      : [VariablesOf<T>, UseQueryOptions<T>?]
  ): Query<T>;
};

export const useQuery: UseQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: VariablesOf<T>,
  options?: UseQueryOptions<T>,
): Query<T> => {
  const client = useClient();

  const [data, setData] = useState<DataOf<T> | undefined>(options?.initialData);
  const [loading, setLoading] = useState(!options?.skip && !options?.initialData);
  const [error, setError] = useState<AggregatedError | undefined>();
  const [metadata, setMetadata] = useState<OperationResult['metadata']>();

  const unsubscribe = useRef<(() => void) | null>(null);
  const initialized = useRef(false);
  const stableVariables = useMemo(() => stringify(variables), [variables]);
  const stableOptions = useMemo(() => options, [options?.skip]);

  const execute = useCallback(() => {
    unsubscribe.current?.();

    if (stableOptions?.skip) {
      return;
    }

    if (!initialized.current && options?.initialData) {
      setLoading(true);
    }

    initialized.current = true;
    setError(undefined);

    unsubscribe.current = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, variables, stableOptions),
      subscribe({
        next: (result) => {
          setMetadata(result.metadata);
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
    metadata,
    refetch: execute,
  } as Query<T>;
}) as unknown as UseQueryFn;
