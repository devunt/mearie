import { useMemo, useRef, useState } from 'react';
import type { Artifact, DataOf, FragmentOptions, FragmentRefs, ObserverState, OperationResult } from '@mearie/core';
import {
  acceptResult,
  applyPatchesImmutable,
  computeObserverKey,
  FragmentRefKey,
  FragmentVarsKey,
  initObserverState,
  reduceFragmentResult,
  stringify,
} from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';
import { useIsomorphicLayoutEffect } from './utils.ts';

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

type UseFragmentFn = {
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: FragmentRefs<T['name']>[],
    options?: UseFragmentOptions,
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: FragmentRefs<T['name']>,
    options?: UseFragmentOptions,
  ): Fragment<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: FragmentRefs<T['name']> | null | undefined,
    options?: UseFragmentOptions,
  ): OptionalFragment<T>;
};

export const useFragment: UseFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined,
  options?: UseFragmentOptions,
) => {
  const client = useClient();

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const readThrough = (ref: unknown): { data: unknown; metadata: OperationResult['metadata'] } => {
    const result = pipe(client.executeFragment(fragment, ref as never, optionsRef.current), peek);
    if (result.data === undefined) {
      throw new Error('Fragment data not found');
    }
    return { data: result.data, metadata: result.metadata };
  };

  // Identity, not content: a re-projection hands down a new ref object on every parent change, but only the
  // storage key and the fragment's own arguments select which fragment this is. Refs without a storage key
  // (keyless or non-normalized) have no identity to key by, so their content is the identity — and since react
  // data is immutable, a content change always arrives as a new object, hence a new string here.
  const stableRef = useMemo(() => stringify(fragmentRef), [fragmentRef]);
  const currentKey = useMemo(() => {
    if (fragmentRef == null) return null;

    const identity = readRefIdentity(fragmentRef, fragment.name);
    return computeObserverKey(fragment, identity ?? fragmentRef);
  }, [fragment, stableRef]);

  const [state, setState] = useState<ObserverState<unknown>>(() => {
    if (fragmentRef == null || currentKey === null) {
      return initObserverState<unknown>();
    }

    const initial = readThrough(fragmentRef);
    return acceptResult(initObserverState<unknown>(), {
      key: currentKey,
      data: initial.data,
      error: undefined,
      metadata: initial.metadata,
    });
  });

  const view = useMemo(() => {
    if (fragmentRef == null || currentKey === null) {
      return { data: null as unknown, metadata: undefined as OperationResult['metadata'] };
    }

    // The emission for this key is the owned copy: serving it keeps the reference stable between emissions.
    if (state.emission?.key === currentKey) {
      return { data: state.emission.data, metadata: state.emission.metadata };
    }

    // A ref transition must resolve in the render that sees it — the subscription only starts after commit,
    // so this render reads through to the cache itself. `peek` has no side effects, so it is idempotent.
    return readThrough(fragmentRef);
  }, [state, currentKey]);

  useIsomorphicLayoutEffect(() => {
    if (currentKey === null) return;

    const key = currentKey;
    const unsubscribe = pipe(
      client.executeFragment(fragment, fragmentRef as never, optionsRef.current),
      subscribe({
        next: (result: OperationResult) => {
          setState((s) => reduceFragmentResult(s, key, result, { applyPatches: applyPatchesImmutable }));
        },
      }),
    );

    return () => {
      unsubscribe();
    };
  }, [client, fragment, currentKey]);

  return { data: view.data, metadata: view.metadata };
}) as unknown as UseFragmentFn;
