import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type UseMutationResult<Document extends DocumentNode> =
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

export type UseMutationReturn<Document extends DocumentNode> = [
  (variables: VariablesOf<Document>) => Promise<DataOf<Document>>,
  UseMutationResult<Document>,
];

export const useMutation = <Document extends DocumentNode>(document: Document): UseMutationReturn<Document> => {
  return [async () => ({}) as DataOf<Document>, { data: undefined, loading: false, error: undefined }];
};
