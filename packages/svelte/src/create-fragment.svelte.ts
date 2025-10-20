import type { Artifact, DataOf, FragmentRefs } from '@mearie/core';

export type Fragment<T extends Artifact<'fragment'>> = DataOf<T>;

export const createFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: () => FragmentRefs<T['name']>,
): Fragment<T> => {
  return $derived.by(() => ({}) as DataOf<T>);
};
