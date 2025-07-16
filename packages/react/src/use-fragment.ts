import type { DocumentNode, DataOf, FragmentRef } from '@mearie/core';

export type UseFragmentReturn<Document extends DocumentNode> = DataOf<Document>;

export const useFragment = <Document extends DocumentNode>(
  document: Document,
  fragmentRef: FragmentRef<Document>,
): UseFragmentReturn<Document> => {
  return {} as DataOf<Document>;
};
