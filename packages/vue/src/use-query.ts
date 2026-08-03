import { computed, reactive, shallowRef, toValue, watch, type Ref, type MaybeRefOrGetter } from 'vue';
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
import { useClient } from './client-plugin.ts';

export type UseQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: Ref<DataOf<T> | undefined>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<true>;
      error: Ref<AggregatedError | undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: Ref<DataOf<T>>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<true>;
      error: Ref<AggregatedError | undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    };

type UseQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: MaybeRefOrGetter<VariablesOf<T>> | undefined,
    options: MaybeRefOrGetter<UseQueryOptions<T> & { initialData: DataOf<T> }>,
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, MaybeRefOrGetter<UseQueryOptions<T>>?]
      : [MaybeRefOrGetter<VariablesOf<T>>, MaybeRefOrGetter<UseQueryOptions<T>>?]
  ): Query<T>;
};

export const useQuery: UseQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: MaybeRefOrGetter<VariablesOf<T>>,
  options?: MaybeRefOrGetter<UseQueryOptions<T>>,
): Query<T> => {
  const client = useClient();

  const wrap = (data: unknown) => reactive(data as object) as DataOf<T>;
  const applyPatches = (current: DataOf<T>, patches: Patch[]): DataOf<T> | null | undefined => {
    const next = applyPatchesMutable(current, patches);
    if (next === undefined) return undefined;
    if (next === null) return null;
    return wrap(next);
  };

  let lastInitialData: InitialDataRef | undefined;

  const buildInitialState = (): ObserverState<DataOf<T>> => {
    const initialData = toValue(options)?.initialData;
    if (initialData === undefined) {
      return initObserverState<DataOf<T>>();
    }

    const initialKey = computeObserverKey(query, toValue(variables));
    lastInitialData = trackInitialData(lastInitialData, initialKey, initialData);
    return acceptInitialData(initObserverState<DataOf<T>>(), initialKey, wrap(initialData));
  };

  // `raw` mirrors `state` so `execute` and the reducer read the last committed value without going through the
  // ref. Those reads sit in callback scopes that do not track today; keeping them off `state.value` means no later
  // move back into a tracking scope can make an effect depend on its own writes.
  let raw = buildInitialState();
  const state = shallowRef<ObserverState<DataOf<T>>>(raw);
  const commit = (next: ObserverState<DataOf<T>>) => {
    raw = next;
    state.value = next;
  };

  const currentKey = computed(() => computeObserverKey(query, toValue(variables)));
  const skip = computed(() => toValue(options)?.skip ?? false);
  const view = computed(() => deriveObserverView(state.value, currentKey.value, skip.value));

  let unsubscribe: (() => void) | null = null;

  const execute = (key: string, skipped: boolean, force: boolean) => {
    unsubscribe?.();
    unsubscribe = null;

    // Must precede the skip early-return: otherwise a variables change under `skip` leaves the emission
    // keyed to the old variables forever, and `DefinedQuery<T>` promises `data` in every arm.
    if (!force && raw.emission?.key !== key) {
      const initialData = toValue(options)?.initialData;
      if (initialData !== undefined) {
        lastInitialData = trackInitialData(lastInitialData, key, initialData);
        commit(acceptInitialData(raw, key, wrap(initialData)));
      }
    }

    if (!force && skipped) return;

    if (force || raw.emission?.key !== key) {
      commit(beginFetch(raw));
    }

    const currentVariables = toValue(variables);
    const currentOptions = toValue(options);

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          commit(reduceObserverResult<DataOf<T>>(raw, key, result, { applyPatches, mapData: wrap }));
        },
      }),
    );
  };

  const refetch = () => execute(currentKey.value, skip.value, true);

  // The watched sources are the whole dependency set: `watch` tracks its sources, not its callback, so the thunk
  // reads inside `execute` cannot enroll the caller's reactive graph in effect re-execution. A `variables` thunk
  // reading a replaced-but-key-equal source must not re-execute the query. fetchPolicy stays a source because
  // changing it is meant to re-execute.
  watch(
    [currentKey, skip, () => toValue(options)?.fetchPolicy],
    ([key, skipped], _previous, onCleanup) => {
      execute(key, skipped, false);

      onCleanup(() => {
        unsubscribe?.();
        unsubscribe = null;
      });
    },
    { immediate: true },
  );

  return {
    data: computed(() => view.value.data),
    previousData: computed(() => view.value.previousData),
    loading: computed(() => view.value.loading),
    error: computed(() => view.value.error),
    metadata: computed(() => view.value.metadata),
    refetch,
  } as Query<T>;
}) as unknown as UseQueryFn;
