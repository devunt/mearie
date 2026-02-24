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

export type OptionalFragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T> | null;
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
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']> | null | undefined>,
    options?: Accessor<CreateFragmentOptions>,
  ): OptionalFragment<T>;
};

export const createFragment: CreateFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: Accessor<FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined>,
  options?: Accessor<CreateFragmentOptions>,
) => {
  const client = useClient();

  const initialRef = fragmentRef();
  let initialData: unknown;
  if (initialRef == null) {
    initialData = null;
  } else {
    const result = pipe(client.executeFragment(fragment, initialRef, options?.()), peek);
    if (result.data === undefined) {
      throw new Error('Fragment data not found');
    }
    initialData = result.data;
  }

  const [data, setData] = createSignal(initialData);

  createEffect(() => {
    const currentRef = fragmentRef();
    if (currentRef == null) {
      setData(() => null);
      return;
    }

    const unsubscribe = pipe(
      client.executeFragment(fragment, currentRef, options?.()),
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
