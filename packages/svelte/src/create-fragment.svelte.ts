import { untrack } from 'svelte';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions, ObserverState } from '@mearie/core';
import {
  acceptResult,
  applyPatchesMutable,
  computeObserverKey,
  initObserverState,
  reduceFragmentResult,
} from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

export type CreateFragmentOptions = FragmentOptions;

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

  const readThrough = (snapshot: unknown): { data: unknown; metadata: OperationResult['metadata'] } => {
    const result = pipe(
      client.executeFragment(
        fragment,
        snapshot as never,
        untrack(() => options?.()),
      ),
      peek,
    );
    if (result.data === undefined) {
      throw new Error('Fragment data not found');
    }
    return { data: result.data, metadata: result.metadata };
  };

  let state = $state<ObserverState<unknown>>(initObserverState());

  {
    const snapshot = untrack(() => $state.snapshot(fragmentRef()));
    if (snapshot != null) {
      const key = computeObserverKey(fragment, snapshot);
      const initial = readThrough(snapshot);
      state = acceptResult(initObserverState(), {
        key,
        data: initial.data,
        error: undefined,
        metadata: initial.metadata,
      });
    }
  }

  const view = $derived.by(() => {
    const refValue = fragmentRef();
    if (refValue == null) {
      return { data: null as unknown, metadata: undefined as OperationResult['metadata'] };
    }

    const snapshot = $state.snapshot(refValue);
    const key = computeObserverKey(fragment, snapshot);
    if (state.emission?.key === key) {
      return { data: state.emission.data, metadata: state.emission.metadata };
    }

    return untrack(() => readThrough(snapshot));
  });

  const data = $derived(view.data);
  const metadata = $derived(view.metadata);

  $effect.pre(() => {
    const refValue = fragmentRef();
    if (refValue == null) return;

    const snapshot = untrack(() => $state.snapshot(refValue));
    const key = computeObserverKey(fragment, snapshot);

    const unsubscribe = pipe(
      client.executeFragment(
        fragment,
        snapshot as never,
        untrack(() => options?.()),
      ),
      subscribe({
        next: (result: OperationResult) => {
          state = reduceFragmentResult(
            untrack(() => state),
            key,
            result,
            { applyPatches: applyPatchesMutable },
          );
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
    get metadata() {
      return metadata;
    },
  };
}) as unknown as CreateFragmentFn;
