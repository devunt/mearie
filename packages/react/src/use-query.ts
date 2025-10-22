import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Artifact, DataOf, QueryOptions, VariablesOf } from '@mearie/core';
import { stringify, AggregatedError } from '@mearie/core';
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

type QueryState<T> = {
  data: T | undefined;
  loading: boolean;
  error: AggregatedError | undefined;
};

type QueryAction<T> =
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: AggregatedError }
  | { type: 'update'; data: T };

const queryReducer = <T>(state: QueryState<T>, action: QueryAction<T>): QueryState<T> => {
  if (action.type === 'loading') {
    return { ...state, loading: true, error: undefined };
  } else if (action.type === 'success') {
    return { data: action.data, loading: false, error: undefined };
  } else if (action.type === 'error') {
    return { ...state, loading: false, error: action.error };
  } else if (action.type === 'update') {
    return { ...state, data: action.data };
  } else {
    return state;
  }
};

export const useQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseQueryOptions?]
    : [VariablesOf<T>, UseQueryOptions?]
): Query<T> => {
  const client = useClient();
  const { skip = false } = options ?? {};
  const [state, dispatch] = useReducer(queryReducer<DataOf<T>>, {
    data: undefined,
    loading: !skip,
    error: undefined,
  });

  const subscriptionRef = useRef<(() => void) | null>(null);
  const variablesKey = useMemo(() => stringify(variables ?? {}), [variables]);

  const executeQuery = useCallback(() => {
    if (skip) {
      return;
    }

    subscriptionRef.current?.();

    dispatch({ type: 'loading' });

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, variables),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            dispatch({ type: 'error', error: new AggregatedError(result.errors) });
          } else {
            dispatch({ type: 'success', data: result.data as DataOf<T> });
          }
        },
      }),
    );

    subscriptionRef.current = unsubscribe;
  }, [client, query, variables, variablesKey, skip]);

  const refetch = useCallback(() => {
    void executeQuery();
  }, [executeQuery]);

  useEffect(() => {
    executeQuery();

    return () => {
      subscriptionRef.current?.();
    };
  }, [executeQuery]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch,
  } as Query<T>;
};
