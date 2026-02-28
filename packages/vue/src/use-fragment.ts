import { ref, watchEffect, toValue, type MaybeRefOrGetter } from 'vue';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type UseFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T>;
  metadata: OperationResult['metadata'];
};

export type FragmentList<T extends Artifact<'fragment'>> = {
  data: DataOf<T>[];
  metadata: OperationResult['metadata'];
};

export type OptionalFragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T> | null;
  metadata: OperationResult['metadata'];
};

type UseFragmentFn = {
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>[]>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): Fragment<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']> | null | undefined>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): OptionalFragment<T>;
};

export const useFragment: UseFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined>,
  ...[options]: [MaybeRefOrGetter<UseFragmentOptions>?]
) => {
  const client = useClient();

  const initialRef = toValue(fragmentRef);
  let initialData: unknown;
  let initialMetadata: OperationResult['metadata'];
  if (initialRef == null) {
    initialData = null;
  } else {
    const result = pipe(client.executeFragment(fragment, initialRef, toValue(options)), peek);
    if (result.data === undefined) {
      throw new Error('Fragment data not found');
    }
    initialData = result.data;
    initialMetadata = result.metadata;
  }

  const data = ref(initialData);
  const metadata = ref<OperationResult['metadata']>(initialMetadata);

  watchEffect((onCleanup) => {
    const currentRef = toValue(fragmentRef);
    if (currentRef == null) {
      data.value = null;
      metadata.value = undefined;
      return;
    }

    const unsubscribe = pipe(
      client.executeFragment(fragment, currentRef, toValue(options)),
      subscribe({
        next: (result: OperationResult) => {
          metadata.value = result.metadata;
          if (result.data !== undefined) {
            data.value = result.data;
          }
        },
      }),
    );

    onCleanup(() => unsubscribe());
  });

  return {
    get data() {
      return data.value;
    },
    get metadata() {
      return metadata.value;
    },
  };
}) as unknown as UseFragmentFn;
