import { useState, useEffect, useMemo } from 'react';
import type { Artifact, DataOf, FragmentRefs } from '@mearie/core';
import { FragmentRefKey, type CacheLink } from '@mearie/core';
import type { Cache } from '@mearie/core';
import { useClient } from './client-provider.tsx';

export type Fragment<T extends Artifact<'fragment'>> = DataOf<T>;

/**
 * Reads fragment data and subscribes to updates.
 *
 * With cache: Fine-grained reactivity (only fragment fields trigger updates)
 * Without cache: Returns entity as-is (type system provides masking)
 */
export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']>,
): Fragment<T> => {
  const client = useClient();
  const cache = client.getLink<CacheLink>('cache')?.cache;

  if (!cache) {
    return fragmentRef as Fragment<T>;
  }

  const entityKey = (fragmentRef as any)[FragmentRefKey];

  if (!entityKey) {
    throw new Error('Entity does not have fragment reference key. ' + 'Make sure cache link is configured correctly.');
  }

  return useCachedFragment(cache, fragment, fragmentRef);
};

/**
 * Cache mode: Subscribe to fragment field changes.
 */
function useCachedFragment<T extends Artifact<'fragment'>>(
  cache: Cache,
  fragment: T,
  fragmentRef: unknown,
): Fragment<T> {
  const [data, setData] = useState(() => cache.readFragment(fragment, fragmentRef, {} as any));

  useEffect(() => {
    return cache.subscribeFragment(fragment, fragmentRef, {} as any, () => {
      setData(cache.readFragment(fragment, fragmentRef, {} as any));
    });
  }, [cache, fragment, fragmentRef]);

  if (!data) {
    throw new Error('Fragment data not found');
  }

  return data as Fragment<T>;
}
