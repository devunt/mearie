import { ref, type Ref, type MaybeRefOrGetter } from 'vue';
import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type UseQueryOptions = {
  skip?: MaybeRefOrGetter<boolean>;
};

export type UseQueryReturn<Document extends DocumentNode> =
  | {
      data: Ref<undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<Document>>;
      loading: Ref<false>;
      error: Ref<undefined>;
      refetch: () => void;
    }
  | {
      data: Ref<DataOf<Document> | undefined>;
      loading: Ref<false>;
      error: Ref<Error>;
      refetch: () => void;
    };

export const useQuery = <Document extends DocumentNode>(
  document: Document,
  variables: MaybeRefOrGetter<VariablesOf<Document>>,
  options?: UseQueryOptions,
): UseQueryReturn<Document> => {
  return {
    data: ref(undefined),
    loading: ref(true),
    error: ref(undefined),
    refetch: () => {},
  };
};
