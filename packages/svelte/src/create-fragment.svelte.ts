import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

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
    fragmentRef: () => FragmentRefs<T['name']>[],
    options?: () => CreateFragmentOptions,
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: () => FragmentRefs<T['name']>,
    options?: () => CreateFragmentOptions,
  ): Fragment<T>;
};

export const createFragment: CreateFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: () => FragmentRefs<T['name']> | FragmentRefs<T['name']>[],
  options?: () => CreateFragmentOptions,
) => {
  const client = getClient();

  const ref = fragmentRef();
  const result = pipe(client.executeFragment(fragment, ref, options?.()), peek);

  if (result.data === undefined) {
    throw new Error('Fragment data not found');
  }

  let data = $state(result.data);

  $effect(() => {
    const unsubscribe = pipe(
      client.executeFragment(fragment, fragmentRef(), options?.()),
      subscribe({
        next: (result: OperationResult) => {
          if (result.data !== undefined) {
            data = result.data;
          }
        },
      }),
    );

    return () => {
      unsubscribe();
    };
  });

  return {
    get data() {
      return data;
    },
  };
}) as unknown as CreateFragmentFn;
