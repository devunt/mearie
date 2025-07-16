import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type UseSubscriptionReturn<Document extends DocumentNode> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
    }
  | {
      data: DataOf<Document>;
      loading: false;
      error: undefined;
    }
  | {
      data: DataOf<Document> | undefined;
      loading: false;
      error: Error;
    };

export type UseSubscriptionOptions<Document extends DocumentNode> = {
  onData?: (data: DataOf<Document>) => void;
  onError?: (error: Error) => void;
};

export const useSubscription = <Document extends DocumentNode>(
  document: Document,
  variables: VariablesOf<Document>,
  options?: UseSubscriptionOptions<Document>,
): UseSubscriptionReturn<Document> => {
  return { data: undefined, loading: true, error: undefined };
};
