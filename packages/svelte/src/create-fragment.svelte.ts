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

export type OptionalFragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T> | null;
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
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: () => FragmentRefs<T['name']> | null | undefined,
    options?: () => CreateFragmentOptions,
  ): OptionalFragment<T>;
};

export const createFragment: CreateFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: () => FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined,
  options?: () => CreateFragmentOptions,
) => {
  const client = getClient();

  const ref = fragmentRef();

  let data: unknown;
  if (ref == null) {
    data = null;
  } else {
    const result = pipe(client.executeFragment(fragment, $state.snapshot(ref) as typeof ref, options?.()), peek);
    if (result.data === undefined) {
      throw new Error('Fragment data not found');
    }
    data = result.data;
  }

  let state = $state(data);

  $effect(() => {
    const currentRef = fragmentRef();
    if (currentRef == null) {
      state = null;
      return;
    }

    const unsubscribe = pipe(
      client.executeFragment(fragment, $state.snapshot(currentRef) as typeof currentRef, options?.()),
      subscribe({
        next: (result: OperationResult) => {
          if (result.data !== undefined) {
            state = result.data;
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
      return state;
    },
  };
}) as unknown as CreateFragmentFn;
