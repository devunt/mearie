import { ref, type Ref, type MaybeRefOrGetter } from 'vue';
import type { Artifact, VariablesOf, DataOf } from '@mearie/core';

export type UseQueryOptions = {
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
      error: Ref<Error>;
      refetch: () => void;
    };

export const useQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseQueryOptions?]
    : [MaybeRefOrGetter<VariablesOf<T>>, UseQueryOptions?]
): Query<T> => {
  return {
    data: ref(undefined),
    loading: ref(true),
    error: ref(undefined),
    refetch: () => {},
  };
};
