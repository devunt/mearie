import { ref, type Ref } from 'vue';
import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type UseMutationResult<Document extends DocumentNode> =
  | {
      data: Ref<undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<Document>>;
      loading: Ref<false>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<Document> | undefined>;
      loading: Ref<false>;
      error: Ref<Error>;
    };

export type UseMutationReturn<Document extends DocumentNode> = [
  (variables: VariablesOf<Document>) => Promise<DataOf<Document>>,
  UseMutationResult<Document>,
];

export const useMutation = <Document extends DocumentNode>(document: Document): UseMutationReturn<Document> => {
  const data = ref<DataOf<Document> | undefined>(undefined);
  const loading = ref(false);
  const error = ref<Error | undefined>(undefined);

  return [
    async () => ({}) as DataOf<Document>,
    {
      data,
      loading,
      error,
    } as UseMutationResult<Document>,
  ];
};
