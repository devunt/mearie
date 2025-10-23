import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VariablesOf, DataOf, Artifact, SubscriptionOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type Subscription<T extends Artifact<'subscription'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
    };

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseSubscriptionOptions<T>?]
    : [VariablesOf<T>, UseSubscriptionOptions<T>?]
): Subscription<T> => {
  const client = useClient();

  const [data, setData] = useState<DataOf<T> | undefined>();
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<AggregatedError | undefined>();

  const unsubscribe = useRef<(() => void) | null>(null);
  const stableOptions = useMemo(() => options, [options?.skip, options?.onData, options?.onError]);

  const execute = useCallback(() => {
    unsubscribe.current?.();

    if (stableOptions?.skip) {
      return;
    }

    setLoading(true);
    setError(undefined);

    unsubscribe.current = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, variables, stableOptions),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            const err = new AggregatedError(result.errors);

            setError(err);
            setLoading(false);

            stableOptions?.onError?.(err);
          } else {
            const resultData = result.data as DataOf<T>;

            setData(resultData);
            setLoading(false);
            setError(undefined);

            stableOptions?.onData?.(resultData);
          }
        },
      }),
    );
  }, [client, subscription, variables, stableOptions]);

  useEffect(() => {
    execute();
    return () => unsubscribe.current?.();
  }, [execute]);

  return {
    data,
    loading,
    error,
  } as Subscription<T>;
};
