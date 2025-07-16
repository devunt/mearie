import { computed, type MaybeRefOrGetter, type ComputedRef } from 'vue';
import type { DocumentNode, DataOf, FragmentRef } from '@mearie/core';

export type UseFragmentReturn<Document extends DocumentNode> = ComputedRef<DataOf<Document>>;

export const useFragment = <Document extends DocumentNode>(
  document: Document,
  fragmentRef: MaybeRefOrGetter<FragmentRef<Document>>,
): UseFragmentReturn<Document> => {
  return computed(() => ({}) as DataOf<Document>);
};
