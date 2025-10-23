import { ref, watchEffect, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type UseFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = Ref<DataOf<T>>;

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>>,
  options?: UseFragmentOptions,
): Fragment<T> => {
  const client = useClient();

  const result = pipe(client.executeFragment(fragment, toValue(fragmentRef), options), peek);

  if (result.data === undefined) {
    throw new Error('Fragment data not found');
  }

  const data = ref<DataOf<T>>(result.data as DataOf<T>);

  watchEffect((onCleanup) => {
    const unsubscribe = pipe(
      client.executeFragment(fragment, toValue(fragmentRef), options),
      subscribe({
        next: (result: OperationResult) => {
          if (result.data !== undefined) {
            data.value = result.data as DataOf<T>;
          }
        },
      }),
    );

    onCleanup(() => unsubscribe());
  });

  return data as Fragment<T>;
};
