import { useSyncExternalStore, useCallback, useRef } from 'react';
import { AggregatedError, type Artifact, type DataOf, type FragmentOptions, type FragmentRefs } from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type UseFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T>;
};

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']>,
  options?: UseFragmentOptions,
): Fragment<T> => {
  const client = useClient();
  const dataRef = useRef<DataOf<T> | undefined>(undefined);

  const subscribe_ = useCallback(
    (onChange: () => void) => {
      return pipe(
        client.executeFragment(fragment, fragmentRef, options),
        subscribe({
          next: (result) => {
            if (result.errors && result.errors.length > 0) {
              throw new AggregatedError(result.errors);
            }

            dataRef.current = result.data as DataOf<T>;
            onChange();
          },
        }),
      );
    },
    [client, fragment, fragmentRef, options],
  );

  const snapshot = useCallback((): DataOf<T> => {
    if (dataRef.current === undefined) {
      const result = pipe(client.executeFragment(fragment, fragmentRef, options), peek);

      if (result.errors && result.errors.length > 0) {
        throw new AggregatedError(result.errors);
      }

      dataRef.current = result.data as DataOf<T>;
    }

    return dataRef.current;
  }, [client, fragment, fragmentRef, options]);

  const data = useSyncExternalStore(subscribe_, snapshot, snapshot);

  return {
    get data() {
      return data;
    },
  };
};
