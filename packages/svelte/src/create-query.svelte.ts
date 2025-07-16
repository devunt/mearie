import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type CreateQueryReturn<Document extends DocumentNode> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<Document>;
      loading: false;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<Document> | undefined;
      loading: false;
      error: Error;
      refetch: () => void;
    };

export const createQuery = <Document extends DocumentNode>(
  document: Document,
  variables: () => VariablesOf<Document>,
): CreateQueryReturn<Document> => {
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
    refetch: () => {},
  };
};
