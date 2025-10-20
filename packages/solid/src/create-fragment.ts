import { createMemo, type Accessor } from 'solid-js';
import type { Artifact, DataOf, FragmentRefs } from '@mearie/core';

export type Fragment<T extends Artifact<'fragment'>> = Accessor<DataOf<T>>;

export const createFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: Accessor<FragmentRefs<T['name']>>,
): Fragment<T> => {
  return createMemo(() => ({}) as DataOf<T>);
};
