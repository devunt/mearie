import type { DocumentNode, DataOf, VariablesOf } from '@mearie/core';

export type UseQueryReturn<Document extends DocumentNode> =
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

export const useQuery = <Document extends DocumentNode>(
  document: Document,
  variables: VariablesOf<Document>,
): UseQueryReturn<Document> => {
  return {
    data: undefined,
    loading: true,
    error: undefined,
    refetch: () => {},
  };
};
