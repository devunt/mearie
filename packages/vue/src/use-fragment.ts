import { computed, type MaybeRefOrGetter, type ComputedRef } from 'vue';
import type { Artifact, DataOf, FragmentRefs } from '@mearie/core';

export type Fragment<T extends Artifact<'fragment'>> = ComputedRef<DataOf<T>>;

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>>,
): Fragment<T> => {
  return computed(() => ({}) as DataOf<T>);
};
