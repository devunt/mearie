import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  AggregatedError,
  Artifact,
  DataOf,
  InitialDataRef,
  ObserverState,
  OperationResult,
  QueryOptions,
  VariablesOf,
} from '@mearie/core';
import {
  acceptInitialData,
  applyPatchesImmutable,
  beginFetch,
  computeObserverKey,
  deriveObserverView,
  initObserverState,
  reduceObserverResult,
  stringify,
  trackInitialData,
} from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';
import { useIsomorphicLayoutEffect } from './utils.ts';

export type UseQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: AggregatedError | undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: AggregatedError | undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
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

  const stableVariables = useMemo(() => stringify(variables), [variables]);
  const currentKey = useMemo(() => computeObserverKey(query, variables), [query, stableVariables]);
  const skip = options?.skip ?? false;

  const lastInitialData = useRef<InitialDataRef | undefined>(undefined);

  const [state, setState] = useState<ObserverState<DataOf<T>>>(() => {
    if (options?.initialData === undefined) {
      return initObserverState<DataOf<T>>();
    }

    const initialKey = computeObserverKey(query, variables);
    lastInitialData.current = trackInitialData(lastInitialData.current, initialKey, options.initialData);
    return acceptInitialData(initObserverState<DataOf<T>>(), initialKey, options.initialData);
  });

  // Must stay in the render phase: deferring to the effect would expose one render of `data: undefined`
  // per variables change (and forever under `skip`), which `DefinedQuery<T>` licenses callers to deref.
  let currentState = state;
  if (options?.initialData !== undefined && state.emission?.key !== currentKey) {
    lastInitialData.current = trackInitialData(lastInitialData.current, currentKey, options.initialData);
    currentState = acceptInitialData(state, currentKey, options.initialData);
    setState(currentState);
  }

  const view = useMemo(() => deriveObserverView(currentState, currentKey, skip), [currentState, currentKey, skip]);

  const unsubscribe = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  const execute = useCallback(
    (force = false) => {
      unsubscribe.current?.();
      unsubscribe.current = null;

      if (!force && optionsRef.current?.skip) return;

      const key = currentKey;

      setState((s) => (force || s.emission?.key !== key ? beginFetch(s) : s));

      const currentVariables = variablesRef.current;
      const currentOptions = optionsRef.current;

      unsubscribe.current = pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeQuery(query, currentVariables, currentOptions),
        subscribe({
          next: (result) => {
            setState((s) => reduceObserverResult<DataOf<T>>(s, key, result, { applyPatches: applyPatchesImmutable }));
          },
        }),
      );
    },
    [client, query, currentKey, skip, options?.fetchPolicy],
  );

  const refetch = useCallback(() => execute(true), [execute]);

  useIsomorphicLayoutEffect(() => {
    execute();
    return () => {
      unsubscribe.current?.();
      unsubscribe.current = null;
    };
  }, [execute]);

  return {
    data: view.data,
    previousData: view.previousData,
    loading: view.loading,
    error: view.error,
    metadata: view.metadata,
    refetch,
  } as Query<T>;
}) as unknown as UseQueryFn;
