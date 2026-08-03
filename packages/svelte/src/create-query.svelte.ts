import { untrack } from 'svelte';
import type {
  Artifact,
  VariablesOf,
  DataOf,
  QueryOptions,
  OperationResult,
  ObserverState,
  AggregatedError,
  Patch,
  InitialDataRef,
} from '@mearie/core';
import {
  applyPatchesMutable,
  acceptInitialData,
  beginFetch,
  computeObserverKey,
  deriveObserverView,
  initObserverState,
  reduceObserverResult,
  trackInitialData,
} from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

export type CreateQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: undefined;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: undefined;
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
      error: undefined;
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

type CreateQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: (() => VariablesOf<T>) | undefined,
    options: () => CreateQueryOptions<T> & { initialData: DataOf<T> },
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, (() => CreateQueryOptions<T>)?]
      : [() => VariablesOf<T>, (() => CreateQueryOptions<T>)?]
  ): Query<T>;
};

export const createQuery: CreateQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: () => VariablesOf<T>,
  options?: () => CreateQueryOptions<T>,
): Query<T> => {
  const client = getClient();

  const getVariables = () => (typeof variables === 'function' ? variables() : undefined);

  const initialOpts = options?.();
  let lastInitialData: InitialDataRef | undefined;

  const buildInitialState = (): ObserverState<DataOf<T>> => {
    if (initialOpts?.initialData === undefined) {
      return initObserverState<DataOf<T>>();
    }

    const initialKey = computeObserverKey(query, untrack(getVariables));
    lastInitialData = trackInitialData(lastInitialData, initialKey, initialOpts.initialData);
    return acceptInitialData(initObserverState<DataOf<T>>(), initialKey, initialOpts.initialData);
  };

  let state = $state<ObserverState<DataOf<T>>>(buildInitialState());

  const currentKey = $derived(computeObserverKey(query, getVariables()));
  const skip = $derived(options?.().skip ?? false);
  const view = $derived(deriveObserverView(state, currentKey, skip));
  const data = $derived(view.data);
  const previousData = $derived(view.previousData);
  const loading = $derived(view.loading);
  const error = $derived(view.error);
  const metadata = $derived(view.metadata);

  let unsubscribe: (() => void) | null = null;

  const applyPatches = (current: DataOf<T>, patches: Patch[]): DataOf<T> | undefined =>
    applyPatchesMutable(current, patches) as DataOf<T> | undefined;

  const execute = (key: string, skipped: boolean, force: boolean) => {
    unsubscribe?.();
    unsubscribe = null;

    if (!force && skipped) return;

    if (force || untrack(() => state).emission?.key !== key) {
      state = beginFetch(untrack(() => state));

      if (!force) {
        const initialData = untrack(() => options?.())?.initialData;
        if (initialData !== undefined) {
          lastInitialData = trackInitialData(lastInitialData, key, initialData);
          state = acceptInitialData(
            untrack(() => state),
            key,
            initialData,
          );
        }
      }
    }

    const currentVariables = untrack(getVariables);
    const currentOptions = untrack(() => options?.());

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          state = reduceObserverResult<DataOf<T>>(
            untrack(() => state),
            key,
            result,
            { applyPatches },
          );
        },
      }),
    );
  };

  $effect.pre(() => {
    const key = currentKey;
    const skipped = skip;
    void options?.().fetchPolicy;

    untrack(() => execute(key, skipped, false));

    return () => {
      unsubscribe?.();
      unsubscribe = null;
    };
  });

  const refetch = () => {
    untrack(() => execute(currentKey, skip, true));
  };

  return {
    get data() {
      return data;
    },
    get previousData() {
      return previousData;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get metadata() {
      return metadata;
    },
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
