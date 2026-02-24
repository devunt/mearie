import { ref, watchEffect, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { Artifact, VariablesOf, DataOf, QueryOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
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
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<false>;
      error: Ref<undefined>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<true>;
      error: Ref<undefined>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<false>;
      error: Ref<undefined>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<T>>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
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
  const data = ref<DataOf<T> | undefined>(initialOpts?.initialData);
  const loading = ref<boolean>(!initialOpts?.skip && !initialOpts?.initialData);
  const error = ref<AggregatedError | undefined>(undefined);

  let unsubscribe: (() => void) | null = null;
  let initialized = false;

  const execute = () => {
    unsubscribe?.();

    if (toValue(options)?.skip) {
      return;
    }

    if (!initialized && initialOpts?.initialData) {
      initialized = true;
      return;
    }
    initialized = true;

    loading.value = true;
    error.value = undefined;

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, toValue(variables), toValue(options)),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            error.value = new AggregatedError(result.errors);
            loading.value = false;
          } else {
            data.value = result.data as DataOf<T>;
            loading.value = false;
            error.value = undefined;
          }
        },
      }),
    );
  };

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
    refetch: execute,
  } as Query<T>;
}) as unknown as UseQueryFn;
