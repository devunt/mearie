import { createMemo, type Accessor } from 'solid-js';
import type { DocumentNode, DataOf, FragmentRef } from '@mearie/core';

export type CreateFragmentReturn<Document extends DocumentNode> = Accessor<DataOf<Document>>;

export const createFragment = <Document extends DocumentNode>(
  document: Document,
  fragmentRef: Accessor<FragmentRef<Document>>,
): CreateFragmentReturn<Document> => {
  return createMemo(() => ({}) as DataOf<Document>);
};
