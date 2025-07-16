import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type CreateMutationReturn<Document extends DocumentNode> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      mutate: (variables: VariablesOf<Document>) => Promise<DataOf<Document>>;
    }
  | {
      data: DataOf<Document>;
      loading: false;
      error: undefined;
      mutate: (variables: VariablesOf<Document>) => Promise<DataOf<Document>>;
    }
  | {
      data: DataOf<Document> | undefined;
      loading: false;
      error: Error;
      mutate: (variables: VariablesOf<Document>) => Promise<DataOf<Document>>;
    };

export const createMutation = <Document extends DocumentNode>(document: Document): CreateMutationReturn<Document> => {
  let data = $state<DataOf<Document> | undefined>(undefined);
  let loading = $state(false);
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
    mutate: async () => ({}) as DataOf<Document>,
  } as CreateMutationReturn<Document>;
};
