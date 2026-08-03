import { createComputed, createMemo, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
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
import { useClient } from './client-provider.tsx';

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
    ? [undefined?, Accessor<CreateSubscriptionOptions<T>>?]
    : [Accessor<VariablesOf<T>>, Accessor<CreateSubscriptionOptions<T>>?]
): Subscription<T> => {
  const client = useClient();

  const getVariables = () => (typeof variables === 'function' ? variables() : undefined);

  // A subscription event replaces `data` wholesale — an event stream has no leaf-level granularity to save — so
  // the state is held in a signal of plain objects rather than a reconciled store. Every commit publishes a new
  // payload reference, which is what a whole-`data` reader needs to re-run, and nothing ever rewrites a payload a
  // consumer already captured.
  // `raw` mirrors the signal so the reducer and the emission callbacks read the last committed value without
  // going through the accessor: those reads sit in callback scopes that do not track today, and keeping them off
  // `state()` means no later move back into a tracking scope can make an effect depend on its own writes.
  let raw = initObserverState<DataOf<T>>();
  const [state, setState] = createSignal<ObserverState<DataOf<T>>>(raw);
  const commit = (next: ObserverState<DataOf<T>>) => {
    raw = next;
    setState(next);
  };

  const currentKey = createMemo(() => computeObserverKey(subscription, getVariables()));
  const skip = createMemo(() => options?.()?.skip ?? false);
  const view = createMemo(() => deriveObserverView(state(), currentKey(), skip()));
  // Per-field memos keep each field's equality gate: `view` rebuilds on every commit, but `loading`, `error` and
  // `metadata` only notify their readers when that field's value actually changes.
  const data = createMemo(() => view().data);
  const previousData = createMemo(() => view().previousData);
  const loading = createMemo(() => view().loading);
  const error = createMemo(() => view().error);
  const metadata = createMemo(() => view().metadata);

  let unsubscribe: (() => void) | null = null;

  // The tracked reads are the whole dependency set: everything below is untracked, so a `variables` thunk whose
  // source was replaced without changing the key must not tear down a live subscription.
  createComputed(() => {
    const key = currentKey();
    const skipped = skip();

    untrack(() => {
      unsubscribe?.();
      unsubscribe = null;

      if (skipped) return;

      const currentVariables = getVariables();
      const currentOptions = options?.();

      unsubscribe = pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeSubscription(subscription, currentVariables, currentOptions),
        subscribe({
          next: (result) => {
            commit(reduceObserverResult<DataOf<T>>(raw, key, result));

            const emitted = raw.emission;
            const opts = untrack(() => options?.());
            if (emitted?.error) {
              opts?.onError?.(emitted.error);
            } else if (emitted?.key === key) {
              opts?.onData?.(emitted.data!);
            }
          },
        }),
      );
    });
  });

  onCleanup(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  return {
    get data() {
      return data();
    },
    get previousData() {
      return previousData();
    },
    get loading() {
      return loading();
    },
    get error() {
      return error();
    },
    get metadata() {
      return metadata();
    },
  } as Subscription<T>;
};
