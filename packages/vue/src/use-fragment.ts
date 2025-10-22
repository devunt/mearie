import { ref, watchEffect, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Artifact, DataOf, FragmentRefs, OperationResult } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type Fragment<T extends Artifact<'fragment'>> = Ref<DataOf<T> | undefined>;

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>>,
): Fragment<T> => {
  const client = useClient();
  const data = ref<DataOf<T>>();

  watchEffect((onCleanup) => {
    const refValue = toValue(fragmentRef);

    const unsubscribe = pipe(
      client.executeFragment(fragment, refValue),
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
