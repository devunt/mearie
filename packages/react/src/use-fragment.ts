import { useSyncExternalStore, useCallback } from 'react';
import { AggregatedError, type Artifact, type DataOf, type FragmentOptions, type FragmentRefs } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type UseFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = DataOf<T>;

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']>,
  options?: UseFragmentOptions,
): Fragment<T> => {
  const client = useClient();

  const subscribe_ = useCallback(
    (onChange: () => void) => {
      return pipe(
        client.executeFragment(fragment, fragmentRef, options),
        subscribe({
          next: onChange,
        }),
      );
    },
    [client, fragment, fragmentRef, options],
  );

  const snapshot = useCallback((): Fragment<T> => {
    const result = pipe(client.executeFragment(fragment, fragmentRef, options), peek);

    if (result.errors && result.errors.length > 0) {
      throw new AggregatedError(result.errors);
    }

    return result.data as Fragment<T>;
  }, [client, fragment, fragmentRef, options]);

  return useSyncExternalStore(subscribe_, snapshot, snapshot);
};
