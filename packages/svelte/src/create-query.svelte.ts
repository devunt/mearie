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
} from '@mearie/core';
import {
  applyPatchesMutable,
  acceptInitialData,
  beginFetch,
  computeObserverKey,
  deriveObserverView,
  initObserverState,
  reduceObserverResult,
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
  let state = $state.raw<ObserverState<DataOf<T>>>(
    initialOpts?.initialData === undefined
      ? initObserverState<DataOf<T>>()
      : acceptInitialData(
          initObserverState<DataOf<T>>(),
          computeObserverKey(query, untrack(getVariables)),
          initialOpts.initialData,
        ),
  );

  const currentKey = $derived(computeObserverKey(query, getVariables()));
  const skip = $derived(options?.().skip ?? false);
  const view = $derived(deriveObserverView(state, currentKey, skip));

  let unsubscribe: (() => void) | null = null;

  const applyPatches = (data: DataOf<T>, patches: Patch[]): DataOf<T> | undefined =>
    applyPatchesMutable(data, patches) as DataOf<T> | undefined;

  const execute = (key: string, skipped: boolean, force: boolean) => {
    unsubscribe?.();
    unsubscribe = null;

    if (!force && skipped) return;

    if (force || untrack(() => state).emission?.key !== key) {
      state = beginFetch(untrack(() => state));

      if (!force) {
        const initialData = untrack(() => options?.())?.initialData;
        if (initialData !== undefined) {
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
      return view.data;
    },
    get previousData() {
      return view.previousData;
    },
    get loading() {
      return view.loading;
    },
    get error() {
      return view.error;
    },
    get metadata() {
      return view.metadata;
    },
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
