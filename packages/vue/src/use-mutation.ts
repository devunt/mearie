import { ref, type Ref } from 'vue';
import type { VariablesOf, DataOf, Artifact, MutationOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, take, collect } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type MutationResult<T extends Artifact<'mutation'>> =
  | {
      data: Ref<undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
    };

export type UseMutationOptions = MutationOptions;

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, UseMutationOptions?]
      : [VariablesOf<T>, UseMutationOptions?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const useMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = useClient();

  const data = ref<DataOf<T> | undefined>(undefined);
  const loading = ref<boolean>(false);
  const error = ref<AggregatedError | undefined>(undefined);

  const execute = async (variables?: VariablesOf<T>, options?: UseMutationOptions): Promise<DataOf<T>> => {
    loading.value = true;
    error.value = undefined;

    try {
      const result = await pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeMutation(mutation, variables, options),
        take(1),
        collect,
      );

      if (result.errors && result.errors.length > 0) {
        const err = new AggregatedError(result.errors);

        error.value = err;
        loading.value = false;

        throw err;
      }

      data.value = result.data as DataOf<T>;
      loading.value = false;

      return result.data as DataOf<T>;
    } catch (err) {
      if (err instanceof AggregatedError) {
        error.value = err;
      }

      loading.value = false;

      throw err;
    }
  };

  return [
    execute,
    {
      data,
      loading,
      error,
    },
  ] as Mutation<T>;
};
