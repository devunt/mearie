import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type CreateSubscriptionReturn<Document extends DocumentNode> =
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

export type CreateSubscriptionOptions<Document extends DocumentNode> = {
  onData?: (data: DataOf<Document>) => void;
  onError?: (error: Error) => void;
};

export const createSubscription = <Document extends DocumentNode>(
  document: Document,
  variables: () => VariablesOf<Document>,
  options?: CreateSubscriptionOptions<Document>,
): CreateSubscriptionReturn<Document> => {
  let data = $state<DataOf<Document> | undefined>(undefined);
  let loading = $state(true);
  let error = $state<Error | undefined>(undefined);

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  } as CreateSubscriptionReturn<Document>;
};
