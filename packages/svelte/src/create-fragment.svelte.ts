import { untrack } from 'svelte';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions, ObserverState } from '@mearie/core';
import {
  acceptResult,
  applyPatchesMutable,
  computeObserverKey,
  FragmentRefKey,
  FragmentVarsKey,
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

type RefIdentity = [storageKey: string, args: unknown];

const readElementIdentity = (element: unknown, fragmentName: string): RefIdentity | undefined => {
  const record = element as Record<string, unknown> | null | undefined;

  const storageKey = record?.[FragmentRefKey];
  if (typeof storageKey !== 'string') return;

  const args = (record?.[FragmentVarsKey] as Record<string, unknown> | undefined)?.[fragmentName];
  return [storageKey, args];
};

const readRefIdentity = (refValue: object, fragmentName: string): RefIdentity | RefIdentity[] | undefined => {
  if (Array.isArray(refValue)) {
    const identities: RefIdentity[] = [];
    for (const element of refValue) {
      const identity = readElementIdentity(element, fragmentName);
      if (identity === undefined) return;
      identities.push(identity);
    }
    return identities;
  }

  return readElementIdentity(refValue, fragmentName);
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

  const currentKey = $derived.by(() => {
    const refValue = fragmentRef();
    if (refValue == null) return;

    const identity = readRefIdentity(refValue, fragment.name);
    if (identity !== undefined) {
      return computeObserverKey(fragment, identity);
    }

    return untrack(() => computeObserverKey(fragment, $state.snapshot(refValue)));
  });

  let state = $state<ObserverState<unknown>>(initObserverState());

  {
    const key = untrack(() => currentKey);
    if (key !== undefined) {
      const initial = readThrough(untrack(() => $state.snapshot(fragmentRef())));
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
    const key = currentKey;
    if (refValue == null || key === undefined) {
      return { data: null as unknown, metadata: undefined as OperationResult['metadata'] };
    }

    if (state.emission?.key === key) {
      return { data: state.emission.data, metadata: state.emission.metadata };
    }

    return untrack(() => readThrough($state.snapshot(refValue)));
  });

  const data = $derived(view.data);
  const metadata = $derived(view.metadata);

  $effect.pre(() => {
    const key = currentKey;
    if (key === undefined) return;

    const snapshot = untrack(() => $state.snapshot(fragmentRef()));

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
