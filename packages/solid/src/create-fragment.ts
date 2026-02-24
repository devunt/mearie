import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type CreateFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T>;
};

export type FragmentList<T extends Artifact<'fragment'>> = {
  data: DataOf<T>[];
};

type CreateFragmentFn = {
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']>[]>,
    options?: Accessor<CreateFragmentOptions>,
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']>>,
    options?: Accessor<CreateFragmentOptions>,
  ): Fragment<T>;
};

export const createFragment: CreateFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: Accessor<FragmentRefs<T['name']> | FragmentRefs<T['name']>[]>,
  options?: Accessor<CreateFragmentOptions>,
) => {
  const client = useClient();

  const result = pipe(client.executeFragment(fragment, fragmentRef(), options?.()), peek);

  if (result.data === undefined) {
    throw new Error('Fragment data not found');
  }

  const [data, setData] = createSignal(result.data);

  createEffect(() => {
    const unsubscribe = pipe(
      client.executeFragment(fragment, fragmentRef(), options?.()),
      subscribe({
        next: (result: OperationResult) => {
          if (result.data !== undefined) {
            setData(() => result.data);
          }
        },
      }),
    );

    onCleanup(() => {
      unsubscribe();
    });
  });

  return {
    get data() {
      return data();
    },
  };
}) as unknown as CreateFragmentFn;
