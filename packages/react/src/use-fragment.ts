import { useSyncExternalStore, useCallback, useRef } from 'react';
import {
  applyPatchesImmutable,
  type Artifact,
  type DataOf,
  type FragmentOptions,
  type FragmentRefs,
  type OperationResult,
} from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

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

const NULL_STORE = { data: null, metadata: undefined } as const;

export const useFragment: UseFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined,
  options?: UseFragmentOptions,
) => {
  const client = useClient();
  const storeRef = useRef<{ data: unknown; metadata: OperationResult['metadata'] }>(undefined);

  const subscribe_ = useCallback(
    (onChange: () => void) => {
      if (fragmentRef == null) {
        storeRef.current = NULL_STORE;
        return () => {};
      }

      return pipe(
        client.executeFragment(fragment, fragmentRef, options),
        subscribe({
          next: (result) => {
            const patches = result.metadata?.cache?.patches;
            if (patches) {
              const prevData = storeRef.current?.data;
              storeRef.current = {
                data: applyPatchesImmutable(prevData, patches),
                metadata: result.metadata,
              };
            } else if (result.data !== undefined) {
              storeRef.current = { data: result.data, metadata: result.metadata };
            }
            onChange();
          },
        }),
      );
    },
    [client, fragment, fragmentRef, options],
  );

  const snapshot = useCallback(() => {
    if (fragmentRef == null) {
      return NULL_STORE;
    }

    if (storeRef.current === undefined) {
      const result = pipe(client.executeFragment(fragment, fragmentRef, options), peek);

      if (result.data === undefined) {
        throw new Error('Fragment data not found');
      }

      storeRef.current = { data: result.data, metadata: result.metadata };
    }

    return storeRef.current;
  }, [client, fragment, fragmentRef, options]);

  const store = useSyncExternalStore(subscribe_, snapshot, snapshot);

  return {
    get data() {
      return store.data;
    },
    get metadata() {
      return store.metadata;
    },
  };
}) as unknown as UseFragmentFn;
