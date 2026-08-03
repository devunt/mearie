import { createComputed, createMemo, onCleanup, untrack, type Accessor } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type {
  Artifact,
  VariablesOf,
  DataOf,
  QueryOptions,
  OperationResult,
  ObserverState,
  AggregatedError,
  InitialDataRef,
} from '@mearie/core';
import {
  acceptInitialData,
  applyPatchesImmutable,
  beginFetch,
  computeObserverKey,
  deriveObserverView,
  initObserverState,
  reduceObserverResult,
  trackInitialData,
} from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';
import { snapshotData } from './utils.ts';

export type CreateQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
};

export type Query<T extends Artifact<'query'>> =
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: AggregatedError | undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: true;
      error: AggregatedError | undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      previousData: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

type CreateQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: Accessor<VariablesOf<T>> | undefined,
    options: Accessor<CreateQueryOptions<T> & { initialData: DataOf<T> }>,
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, Accessor<CreateQueryOptions<T>>?]
      : [Accessor<VariablesOf<T>>, Accessor<CreateQueryOptions<T>>?]
  ): Query<T>;
};

export const createQuery: CreateQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: Accessor<VariablesOf<T>>,
  options?: Accessor<CreateQueryOptions<T>>,
): Query<T> => {
  const client = useClient();

  const getVariables = () => (typeof variables === 'function' ? variables() : undefined);

  let lastInitialData: InitialDataRef | undefined;

  const buildInitialState = (): ObserverState<DataOf<T>> => {
    const initialData = untrack(() => options?.())?.initialData;
    if (initialData === undefined) {
      return initObserverState<DataOf<T>>();
    }

    const initialKey = computeObserverKey(query, untrack(getVariables));
    lastInitialData = trackInitialData(lastInitialData, initialKey, initialData);
    return acceptInitialData(initObserverState<DataOf<T>>(), initialKey, initialData);
  };

  // `raw` mirrors the store so `execute` and the reducer read the last committed value as a plain immutable
  // object. The store node is not that object: `reconcile` diffs into the previously committed nodes, so
  // reading state back out of the store would feed proxies (and reconcile's in-place edits) into the reducer.
  let raw = buildInitialState();
  const [state, setState] = createStore<{ current: ObserverState<DataOf<T>> }>({ current: raw });
  const commit = (next: ObserverState<DataOf<T>>) => {
    // A fresh succession hands `previous.data` the very node the store is about to rewrite in place:
    // `reconcile` diffs the incoming emission into the previously committed data node, so without a copy
    // `previousData` would report the new payload whenever the root is diffable (an id-less root always is).
    // Snapshot at the transition only — steady-state commits carry `previous` forward by identity.
    // `untrack` because `initialData` may itself be reactive, and this walk must not enroll the caller's
    // graph in a commit that runs inside the driving computation.
    const outgoing = next.previous;
    let settled = next;
    if (outgoing !== undefined && outgoing !== raw.previous) {
      const data = untrack(() => snapshotData(outgoing.data)) as DataOf<T>;
      settled = { ...next, previous: { ...outgoing, data } };
    }

    raw = settled;
    setState('current', reconcile(settled));
  };

  const currentKey = createMemo(() => computeObserverKey(query, getVariables()));
  const skip = createMemo(() => options?.()?.skip ?? false);
  const view = createMemo(() => deriveObserverView(state.current, currentKey(), skip()));
  // Per-field memos keep the store grain: `view` rebuilds on every commit, but each field only notifies its
  // readers when that field's value actually changes, so a patched leaf never invalidates a `data` reader.
  const data = createMemo(() => view().data);
  const previousData = createMemo(() => view().previousData);
  const loading = createMemo(() => view().loading);
  const error = createMemo(() => view().error);
  const metadata = createMemo(() => view().metadata);

  let unsubscribe: (() => void) | null = null;

  const execute = (key: string, skipped: boolean, force: boolean) => {
    unsubscribe?.();
    unsubscribe = null;

    // Must precede the skip early-return: otherwise a variables change under `skip` leaves the emission
    // keyed to the old variables forever, and `DefinedQuery<T>` promises `data` in every arm.
    if (!force && raw.emission?.key !== key) {
      const initialData = untrack(() => options?.())?.initialData;
      if (initialData !== undefined) {
        lastInitialData = trackInitialData(lastInitialData, key, initialData);
        commit(acceptInitialData(raw, key, initialData));
      }
    }

    if (!force && skipped) return;

    if (force || raw.emission?.key !== key) {
      commit(beginFetch(raw));
    }

    const currentVariables = untrack(getVariables);
    const currentOptions = untrack(() => options?.());

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          commit(reduceObserverResult<DataOf<T>>(raw, key, result, { applyPatches: applyPatchesImmutable }));
        },
      }),
    );
  };

  // The tracked reads are the whole dependency set: everything `execute` touches is untracked, so a
  // `variables` thunk whose source was replaced without changing the key must not re-execute the query.
  // fetchPolicy stays tracked because changing it is meant to re-execute.
  createComputed(() => {
    const key = currentKey();
    const skipped = skip();
    void options?.()?.fetchPolicy;

    untrack(() => execute(key, skipped, false));
  });

  onCleanup(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  const refetch = () => {
    untrack(() => execute(currentKey(), skip(), true));
  };

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
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
