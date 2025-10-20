import { ref, type Ref } from 'vue';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';

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
      error: Ref<Error>;
    };

export type UseMutationOptions = {
  skip?: boolean;
};

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends undefined
      ? [undefined?, UseMutationOptions?]
      : [VariablesOf<T>, UseMutationOptions?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const useMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const data = ref<DataOf<T> | undefined>(undefined);
  const loading = ref(false);
  const error = ref<Error | undefined>(undefined);

  return [
    async () => ({}) as DataOf<T>,
    {
      data,
      loading,
      error,
    } as MutationResult<T>,
  ];
};
