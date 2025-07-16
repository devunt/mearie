import type { DocumentNode, DataOf, FragmentRef } from '@mearie/core';

export type CreateFragmentReturn<Document extends DocumentNode> = DataOf<Document>;

export const createFragment = <Document extends DocumentNode>(
  document: Document,
  fragmentRef: () => FragmentRef<Document>,
): CreateFragmentReturn<Document> => {
  return $derived.by(() => ({}) as DataOf<Document>);
};
