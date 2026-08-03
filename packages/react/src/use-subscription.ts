import { useMemo, useRef, useState } from 'react';
import type {
  AggregatedError,
  Artifact,
  DataOf,
  ObserverState,
  OperationResult,
  SubscriptionOptions,
  VariablesOf,
} from '@mearie/core';
import {
  computeObserverKey,
  deriveObserverView,
  initObserverState,
  reduceObserverResult,
  stringify,
} from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';
import { useIsomorphicLayoutEffect } from './utils.ts';

export type Subscription<T extends Artifact<'subscription'>> =
  | {
      data: undefined;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: undefined;
      metadata: OperationResult['metadata'];
    }
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
    }
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
    };

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends Record<string, never>
    ? [undefined?, UseSubscriptionOptions<T>?]
    : [VariablesOf<T>, UseSubscriptionOptions<T>?]
): Subscription<T> => {
  const client = useClient();

  const stableVariables = useMemo(() => stringify(variables), [variables]);
  const currentKey = useMemo(() => computeObserverKey(subscription, variables), [subscription, stableVariables]);
  const skip = options?.skip ?? false;

  const [state, setState] = useState<ObserverState<DataOf<T>>>(() => initObserverState<DataOf<T>>());
  const view = useMemo(() => deriveObserverView(state, currentKey, skip), [state, currentKey, skip]);

  // Mirrors `state` for the emission reducer so callbacks stay outside the `setState` updater,
  // which StrictMode invokes twice.
  const stateRef = useRef(state);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  useIsomorphicLayoutEffect(() => {
    if (skip) return;

    const key = currentKey;
    const currentVariables = variablesRef.current;
    const currentOptions = optionsRef.current;

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          const next = reduceObserverResult<DataOf<T>>(stateRef.current, key, result);
          stateRef.current = next;
          setState(next);

          const emitted = next.emission;
          const opts = optionsRef.current;
          if (emitted?.error) {
            opts?.onError?.(emitted.error);
          } else if (emitted?.key === key) {
            opts?.onData?.(emitted.data!);
          }
        },
      }),
    );

    return () => {
      unsubscribe();
    };
  }, [client, subscription, currentKey, skip]);

  return {
    data: view.data,
    previousData: view.previousData,
    loading: view.loading,
    error: view.error,
    metadata: view.metadata,
  } as Subscription<T>;
};
