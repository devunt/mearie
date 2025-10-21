import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Artifact, DataOf, VariablesOf } from '@mearie/core';
import { stableStringify, type CacheLink } from '@mearie/core';
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
      error: Error;
      refetch: () => void;
    };

export type UseQueryOptions = {
  skip?: boolean;
  fetchPolicy?: 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
};

type QueryState<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
};

type QueryAction<T> =
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: Error }
  | { type: 'update'; data: T };

const queryReducer = <T>(state: QueryState<T>, action: QueryAction<T>): QueryState<T> => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: undefined };
    case 'success':
      return { data: action.data, loading: false, error: undefined };
    case 'error':
      return { ...state, loading: false, error: action.error };
    case 'update':
      return { ...state, data: action.data };
    default:
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const variablesKey = useMemo(() => stableStringify(variables ?? {}), [variables]);

  const executeQuery = useCallback(async () => {
    if (skip) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch({ type: 'loading' });

    try {
      const result = await client.query<DataOf<T>, VariablesOf<T>>(query, variables, { signal: controller.signal });

      if (!controller.signal.aborted) {
        if (result.errors && result.errors.length > 0) {
          dispatch({ type: 'error', error: new Error(result.errors[0]?.message ?? 'GraphQL error') });
        } else {
          dispatch({ type: 'success', data: result.data });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  }, [client, query, variablesKey, skip]);

  const refetch = useCallback(() => {
    void executeQuery();
  }, [executeQuery]);

  useEffect(() => {
    void executeQuery();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [executeQuery]);

  useEffect(() => {
    const cache = client.getLink<CacheLink>('cache')?.cache;
    if (!cache || skip) {
      return;
    }

    const unsubscribe = cache.subscribe(query, variables ?? ({} as VariablesOf<T>), () => {
      const cached = cache.readQuery(query, variables ?? ({} as VariablesOf<T>));
      if (cached) {
        dispatch({ type: 'update', data: cached as DataOf<T> });
      }
    });

    return unsubscribe;
  }, [client, query, variablesKey, skip]);

  return {
    data: state.data as DataOf<T> | undefined,
    loading: state.loading,
    error: state.error,
    refetch,
  } as Query<T>;
};
