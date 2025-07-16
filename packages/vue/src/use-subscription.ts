import { ref, type Ref, type MaybeRefOrGetter } from 'vue';
import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type UseSubscriptionReturn<Document extends DocumentNode> =
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

export type UseSubscriptionOptions<Document extends DocumentNode> = {
  onData?: (data: DataOf<Document>) => void;
  onError?: (error: Error) => void;
};

export const useSubscription = <Document extends DocumentNode>(
  document: Document,
  variables: MaybeRefOrGetter<VariablesOf<Document>>,
  options?: UseSubscriptionOptions<Document>,
): UseSubscriptionReturn<Document> => {
  const data = ref<DataOf<Document> | undefined>(undefined);
  const loading = ref(true);
  const error = ref<Error | undefined>(undefined);

  return {
    data,
    loading,
    error,
  } as UseSubscriptionReturn<Document>;
};
