import { untrack } from 'svelte';
import type {
  VariablesOf,
  DataOf,
  Artifact,
  SubscriptionOptions,
  OperationResult,
  ObserverState,
  AggregatedError,
} from '@mearie/core';
import { computeObserverKey, deriveObserverView, initObserverState, reduceObserverResult } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

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

export type CreateSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const createSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends Record<string, never>
    ? [undefined?, (() => CreateSubscriptionOptions<T>)?]
    : [() => VariablesOf<T>, (() => CreateSubscriptionOptions<T>)?]
): Subscription<T> => {
  const client = getClient();

  const getVariables = () => (typeof variables === 'function' ? variables() : undefined);

  let state = $state.raw<ObserverState<DataOf<T>>>(initObserverState<DataOf<T>>());

  const currentKey = $derived(computeObserverKey(subscription, getVariables()));
  const skip = $derived(options?.().skip ?? false);
  const view = $derived(deriveObserverView(state, currentKey, skip));
  const data = $derived(view.data);
  const previousData = $derived(view.previousData);
  const loading = $derived(view.loading);
  const error = $derived(view.error);
  const metadata = $derived(view.metadata);

  $effect.pre(() => {
    const key = currentKey;
    if (skip) return;

    const currentVariables = untrack(getVariables);
    const currentOptions = untrack(() => options?.());

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          state = reduceObserverResult(
            untrack(() => state),
            key,
            result,
          );
          const emitted = untrack(() => state).emission;
          const opts = untrack(() => options?.());
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
  });

  return {
    get data() {
      return data;
    },
    get previousData() {
      return previousData;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get metadata() {
      return metadata;
    },
  } as Subscription<T>;
};
