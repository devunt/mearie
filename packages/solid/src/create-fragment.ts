import { createComputed, createMemo, onCleanup, untrack, type Accessor } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { Artifact, DataOf, FragmentRefs, OperationResult, FragmentOptions, ObserverState } from '@mearie/core';
import {
  acceptResult,
  applyPatchesImmutable,
  computeObserverKey,
  initObserverState,
  readRefIdentity,
  reduceFragmentResult,
} from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type CreateFragmentOptions = FragmentOptions;

export type Fragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T>;
  metadata: OperationResult['metadata'];
};

export type FragmentList<T extends Artifact<'fragment'>> = {
  data: DataOf<T>[];
  metadata: OperationResult['metadata'];
};

export type OptionalFragment<T extends Artifact<'fragment'>> = {
  data: DataOf<T> | null;
  metadata: OperationResult['metadata'];
};

type CreateFragmentFn = {
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']>[]>,
    options?: Accessor<CreateFragmentOptions>,
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']>>,
    options?: Accessor<CreateFragmentOptions>,
  ): Fragment<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: Accessor<FragmentRefs<T['name']> | null | undefined>,
    options?: Accessor<CreateFragmentOptions>,
  ): OptionalFragment<T>;
};

type FragmentView = { data: unknown; metadata: OperationResult['metadata']; missing: boolean };

export const createFragment: CreateFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: Accessor<FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined>,
  options?: Accessor<CreateFragmentOptions>,
) => {
  const client = useClient();

  const readThrough = (refValue: unknown): FragmentView => {
    const result = pipe(
      client.executeFragment(
        fragment,
        refValue as never,
        untrack(() => options?.()),
      ),
      peek,
    );
    if (result.data === undefined) {
      return { data: undefined, metadata: result.metadata, missing: true };
    }
    return { data: result.data, metadata: result.metadata, missing: false };
  };

  // Identity, not content: a re-projection hands down a new ref object on every parent change, but only the
  // storage key and the fragment's own arguments select which fragment this is. Refs without a storage key
  // (keyless or non-normalized) have no identity to key by, so their content is the identity.
  const keyOf = (refValue: object) =>
    computeObserverKey(fragment, readRefIdentity(refValue, fragment.name) ?? refValue);

  // The ref is usually a node of the parent query's store, so what this memo reads is what it depends on:
  // the identity branch touches only the two ref keys (a sibling leaf patch never re-keys), while the
  // content fallback stringifies the ref and therefore tracks it deeply — which is the right grain for a
  // keyless ref, whose only update channel is the parent handing down new content.
  const currentKey = createMemo(() => {
    const refValue = fragmentRef();
    return refValue == null ? null : keyOf(refValue);
  });

  // `raw` mirrors the store so the reducer reads the last committed value as a plain immutable object. The
  // store node is not that object: `reconcile` diffs the incoming emission into the previously committed
  // nodes, so reading state back out of the store would feed proxies (and reconcile's in-place edits) into
  // the reducer.
  let raw = initObserverState<unknown>();
  {
    const key = untrack(currentKey);
    if (key !== null) {
      const initial = readThrough(untrack(fragmentRef));
      if (initial.missing) {
        throw new Error('Fragment data not found');
      }
      raw = acceptResult(raw, {
        key,
        data: initial.data,
        error: undefined,
        metadata: initial.metadata,
      });
    }
  }
  const [state, setState] = createStore<{ current: ObserverState<unknown> }>({ current: raw });
  const commit = (next: ObserverState<unknown>) => {
    raw = next;
    setState('current', reconcile(next));
  };

  const view = createMemo<FragmentView>(() => {
    const key = currentKey();
    if (key === null) {
      return { data: null, metadata: undefined, missing: false };
    }

    // The emission for this key is the store node: serving it keeps the reference stable between emissions,
    // which is what leaves a patched leaf to notify only its own readers.
    const emission = state.current.emission;
    if (emission?.key === key) {
      return { data: emission.data, metadata: emission.metadata, missing: false };
    }

    // A ref transition must resolve for the reader that sees it — the subscription only moves later in the
    // same update queue, so this read goes through to the cache itself. `peek` has no side effects, so it is
    // idempotent.
    return untrack(() => readThrough(fragmentRef()));
  });

  // Per-field memos keep the store grain: `view` allocates a new object whenever it recomputes, so reading
  // through it directly would wake every reader on any emission. These only notify when their own field
  // actually changes, which leaves patched-in-place data to propagate through the store node itself.
  const data = createMemo(() => view().data);
  const metadata = createMemo(() => view().metadata);
  const missing = createMemo(() => view().missing);

  let unsubscribe: (() => void) | null = null;

  // The tracked read is the whole dependency set: everything the execution path touches is untracked, so a
  // re-projection that keeps the ref identity must not tear down a live subscription — and neither can the
  // reducer's reads of the data it just committed.
  createComputed(() => {
    const key = currentKey();

    untrack(() => {
      unsubscribe?.();
      unsubscribe = null;
      if (key === null) return;

      unsubscribe = pipe(
        client.executeFragment(fragment, fragmentRef() as never, options?.()),
        subscribe({
          next: (result: OperationResult) => {
            commit(reduceFragmentResult(raw, key, result, { applyPatches: applyPatchesImmutable }));
          },
        }),
      );
    });
  });

  onCleanup(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  // A read-through miss must throw on every read, not just the first, and the throw cannot live inside the
  // memo graph to do that. When a memo's computation throws, solid leaves it STALE but also stamps
  // `updatedAt = ExecCount + 1`; a downstream memo left PENDING then resolves through `lookUpstream`, whose
  // `updatedAt < ExecCount` guard skips the re-run, clears its own state and serves its cached value — the
  // previous ref's data, which is exactly the exposure the read-through exists to prevent. The per-field
  // memos below `view` are that downstream layer, so the throw sits outside the graph, gated by a boolean
  // that only flips when the miss itself does — patches therefore never wake a reader through it.
  const guard = () => {
    if (missing()) {
      throw new Error('Fragment data not found');
    }
  };

  return {
    get data() {
      guard();
      return data();
    },
    get metadata() {
      guard();
      return metadata();
    },
  };
}) as unknown as CreateFragmentFn;
