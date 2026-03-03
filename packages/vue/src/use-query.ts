import { ref, shallowRef, reactive, watchEffect, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { Artifact, VariablesOf, DataOf, QueryOptions, OperationResult } from '@mearie/core';
import { AggregatedError, applyPatchesMutable } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type UseQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: Ref<undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<false>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<true>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<false>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
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

  const initialOpts = toValue(options);
  const data = shallowRef<DataOf<T> | undefined>(
    initialOpts?.initialData ? (reactive(initialOpts.initialData) as DataOf<T>) : undefined,
  );
  const loading = ref<boolean>(!initialOpts?.skip && !initialOpts?.initialData);
  const error = ref<AggregatedError | undefined>(undefined);
  const metadata = ref<OperationResult['metadata']>();

  let unsubscribe: (() => void) | null = null;
  let initialized = false;

  const execute = (force = false) => {
    unsubscribe?.();

    if (!force && toValue(options)?.skip) {
      loading.value = false;
      return;
    }

    if (initialized || !initialOpts?.initialData) {
      loading.value = true;
    }

    initialized = true;
    error.value = undefined;

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, toValue(variables), toValue(options)),
      subscribe({
        next: (result) => {
          metadata.value = result.metadata;
          if (result.errors && result.errors.length > 0) {
            error.value = new AggregatedError(result.errors);
            loading.value = false;
          } else {
            const patches = result.metadata?.cache?.patches;
            if (patches) {
              const root = applyPatchesMutable(data.value, patches);
              if (root !== undefined) data.value = reactive(root as object) as DataOf<T>;
            } else {
              data.value = reactive(result.data as object) as DataOf<T>;
            }
            loading.value = false;
            error.value = undefined;
          }
        },
      }),
    );
  };

  const refetch = () => execute(true);

  watchEffect((onCleanup) => {
    execute();

    onCleanup(() => {
      unsubscribe?.();
    });
  });

  return {
    data,
    loading,
    error,
    metadata,
    refetch,
  } as Query<T>;
}) as unknown as UseQueryFn;
