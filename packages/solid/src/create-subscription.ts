import { createComputed, createMemo, onCleanup, untrack, type Accessor } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
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
import { snapshotData } from './utils.ts';

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

  // `raw` mirrors the store so the reducer and the emission callbacks read the last committed value as a plain
  // immutable object. The store node is not that object: `reconcile` diffs into the previously committed nodes,
  // so reading state back out of the store would feed proxies (and reconcile's in-place edits) into the reducer.
  let raw = initObserverState<DataOf<T>>();
  const [state, setState] = createStore<{ current: ObserverState<DataOf<T>> }>({ current: raw });
  const commit = (next: ObserverState<DataOf<T>>) => {
    // A fresh succession hands `previous.data` the very node the store is about to rewrite in place:
    // `reconcile` diffs the incoming emission into the previously committed data node, so without a copy
    // `previousData` would report the new payload whenever the root is diffable (an id-less root always is).
    // Snapshot at the transition only — steady-state commits carry `previous` forward by identity.
    // `untrack` because an emission can land inside a live computation (a synchronous source commits inside
    // the driver), and this walk must not enroll that computation in the payload's reads.
    const outgoing = next.previous;
    let settled = next;
    if (outgoing !== undefined && outgoing !== raw.previous) {
      const data = untrack(() => snapshotData(outgoing.data)) as DataOf<T>;
      settled = { ...next, previous: { ...outgoing, data } };
    }

    raw = settled;
    setState('current', reconcile(settled));
  };

  const currentKey = createMemo(() => computeObserverKey(subscription, getVariables()));
  const skip = createMemo(() => options?.()?.skip ?? false);
  const view = createMemo(() => deriveObserverView(state.current, currentKey(), skip()));
  // Per-field memos keep the store grain: `view` rebuilds on every commit, but each field only notifies its
  // readers when that field's value actually changes.
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
