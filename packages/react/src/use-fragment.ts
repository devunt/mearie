import { useState, useEffect } from 'react';
import type { Artifact, DataOf, FragmentRefs, OperationResult } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type Fragment<T extends Artifact<'fragment'>> = DataOf<T>;

export const useFragment = <T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: FragmentRefs<T['name']>,
): Fragment<T> => {
  const client = useClient();
  // eslint-disable-next-line unicorn/no-useless-undefined
  const [data, setData] = useState<Fragment<T> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = pipe(
      client.executeFragment(fragment, fragmentRef),
      subscribe({
        next: (result: OperationResult) => {
          if (result.data !== undefined) {
            setData(result.data as Fragment<T>);
          }
        },
      }),
    );

    return unsubscribe;
  }, [client, fragment, fragmentRef]);

  if (data === undefined) {
    throw new Error('Fragment data not found');
  }

  return data;
};
