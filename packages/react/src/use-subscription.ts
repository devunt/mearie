import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';
import { stringify, AggregatedError } from '@mearie/core';
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

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

type SubscriptionState<T> = {
  data: T | undefined;
  loading: boolean;
  error: AggregatedError | undefined;
};

type SubscriptionAction<T> =
  | { type: 'loading' }
  | { type: 'data'; data: T }
  | { type: 'error'; error: AggregatedError };

const subscriptionReducer = <T>(state: SubscriptionState<T>, action: SubscriptionAction<T>): SubscriptionState<T> => {
  if (action.type === 'loading') {
    return { ...state, loading: true, error: undefined };
  } else if (action.type === 'data') {
    return { data: action.data, loading: false, error: undefined };
  } else if (action.type === 'error') {
    return { ...state, loading: false, error: action.error };
  } else {
    return state;
  }
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseSubscriptionOptions<T>?]
    : [VariablesOf<T>, UseSubscriptionOptions<T>?]
): Subscription<T> => {
  const client = useClient();
  const { skip = false, onData, onError } = options ?? {};
  const [state, dispatch] = useReducer(subscriptionReducer<DataOf<T>>, {
    data: undefined,
    loading: !skip,
    error: undefined,
  });

  const subscriptionRef = useRef<(() => void) | null>(null);
  const variablesKey = useMemo(() => stringify(variables ?? {}), [variables]);

  const executeSubscription = useCallback(() => {
    if (skip) {
      return;
    }

    subscriptionRef.current?.();

    dispatch({ type: 'loading' });

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, variables),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            const error = new AggregatedError(result.errors);
            dispatch({ type: 'error', error });
            onError?.(error);
          } else {
            const data = result.data as DataOf<T>;
            dispatch({ type: 'data', data });
            onData?.(data);
          }
        },
      }),
    );

    subscriptionRef.current = unsubscribe;
  }, [client, subscription, variables, variablesKey, skip, onData, onError]);

  useEffect(() => {
    executeSubscription();

    return () => {
      subscriptionRef.current?.();
    };
  }, [executeSubscription]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
  } as Subscription<T>;
};
