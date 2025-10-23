import { ref, watchEffect, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { Artifact, VariablesOf, DataOf, QueryOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type UseQueryOptions = QueryOptions & {
  skip?: MaybeRefOrGetter<boolean>;
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

export const useQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseQueryOptions?]
    : [MaybeRefOrGetter<VariablesOf<T>>, UseQueryOptions?]
): Query<T> => {
  const client = useClient();

  const data = ref<DataOf<T> | undefined>(undefined);
  const loading = ref<boolean>(false);
  const error = ref<AggregatedError | undefined>(undefined);

  let unsubscribe: (() => void) | null = null;

  const execute = () => {
    unsubscribe?.();

    if (toValue(options?.skip)) {
      return;
    }

    loading.value = true;
    error.value = undefined;

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, toValue(variables), options),
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
};
