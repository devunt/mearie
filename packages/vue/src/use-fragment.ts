import { computed, reactive, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
  Artifact,
  DataOf,
  FragmentRefs,
  OperationResult,
  FragmentOptions,
  ObserverState,
  Patch,
} from '@mearie/core';
import {
  acceptResult,
  applyPatchesMutable,
  computeObserverKey,
  initObserverState,
  readRefIdentity,
  reduceFragmentResult,
} from '@mearie/core';
import { pipe, subscribe, peek } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type UseFragmentOptions = FragmentOptions;

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

type UseFragmentFn = {
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>[]>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): FragmentList<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']>>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): Fragment<T>;
  <T extends Artifact<'fragment'>>(
    fragment: T,
    fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']> | null | undefined>,
    ...options: [MaybeRefOrGetter<UseFragmentOptions>?]
  ): OptionalFragment<T>;
};

type FragmentView = { data: unknown; metadata: OperationResult['metadata']; missing: boolean };

export const useFragment: UseFragmentFn = (<T extends Artifact<'fragment'>>(
  fragment: T,
  fragmentRef: MaybeRefOrGetter<FragmentRefs<T['name']> | FragmentRefs<T['name']>[] | null | undefined>,
  ...[options]: [MaybeRefOrGetter<UseFragmentOptions>?]
) => {
  const client = useClient();

  // `reactive` warns and hands back the input for anything that is not an object, so null roots — a root-level
  // patch can replace the payload with one — must never reach it.
  const wrap = (data: unknown): unknown => (typeof data === 'object' && data !== null ? reactive(data) : data);

  const applyPatches = (current: unknown, patches: Patch[]): unknown => {
    const next = applyPatchesMutable(current, patches);
    // undefined means no root replacement happened: the in-place mutation already landed on the reactive copy.
    if (next === undefined) return undefined;
    if (next === null) return null;
    return wrap(next);
  };

  const readThrough = (refValue: unknown): FragmentView => {
    const result = pipe(client.executeFragment(fragment, refValue as never, toValue(options)), peek);
    if (result.data === undefined) {
      return { data: undefined, metadata: result.metadata, missing: true };
    }
    return { data: wrap(result.data), metadata: result.metadata, missing: false };
  };

  // Identity, not content: a re-projection hands down a new ref object on every parent change, but only the
  // storage key and the fragment's own arguments select which fragment this is. Refs without a storage key
  // (keyless or non-normalized) have no identity to key by, so their content is the identity.
  const keyOf = (refValue: object) =>
    computeObserverKey(fragment, readRefIdentity(refValue, fragment.name) ?? refValue);

  // `raw` mirrors `state` so the reducer reads the last committed value without going through the ref. That read
  // sits in a callback scope that does not track today; keeping it off `state.value` means no later move back into
  // a tracking scope can make the effect depend on its own writes.
  let raw = initObserverState<unknown>();
  {
    const refValue = toValue(fragmentRef);
    if (refValue != null) {
      const initial = readThrough(refValue);
      if (initial.missing) {
        throw new Error('Fragment data not found');
      }
      raw = acceptResult(raw, {
        key: keyOf(refValue),
        data: initial.data,
        error: undefined,
        metadata: initial.metadata,
      });
    }
  }
  const state = shallowRef<ObserverState<unknown>>(raw);
  const commit = (next: ObserverState<unknown>) => {
    raw = next;
    state.value = next;
  };

  const currentKey = computed(() => {
    const refValue = toValue(fragmentRef);
    return refValue == null ? null : keyOf(refValue);
  });

  const view = computed<FragmentView>(() => {
    const key = currentKey.value;
    if (key === null) {
      return { data: null, metadata: undefined, missing: false };
    }

    // The emission for this key is the owned copy: serving it keeps the reference stable between emissions.
    const emission = state.value.emission;
    if (emission?.key === key) {
      return { data: emission.data, metadata: emission.metadata, missing: false };
    }

    // A ref transition must resolve for the reader that sees it — the subscription only moves on the next flush,
    // so this read goes through to the cache itself. `peek` has no side effects, so it is idempotent.
    return readThrough(toValue(fragmentRef));
  });

  // Per-field computeds: `view` allocates a new object on every recomputation, so reading through it directly
  // would wake every reader on any emission. These only notify when their own field actually changes, which
  // leaves patched-in-place data to propagate through the reactive payload itself.
  const data = computed(() => view.value.data);
  const metadata = computed(() => view.value.metadata);
  const missing = computed(() => view.value.missing);

  // The watched source is the whole dependency set: `watch` tracks its sources, not its callback, so the thunk
  // reads below cannot enroll the caller's reactive graph in effect re-execution — and neither can the reducer's
  // reads of the data it just committed. A re-projection that keeps the ref identity must not resubscribe.
  watch(
    [currentKey],
    ([key], _previous, onCleanup) => {
      if (key === null) return;

      const unsubscribe = pipe(
        client.executeFragment(fragment, toValue(fragmentRef) as never, toValue(options)),
        subscribe({
          next: (result: OperationResult) => {
            commit(reduceFragmentResult(raw, key, result, { applyPatches, mapData: wrap }));
          },
        }),
      );

      onCleanup(() => {
        unsubscribe();
      });
    },
    { immediate: true },
  );

  // A read-through miss must throw on every read, not just the first: a computed whose getter throws keeps its
  // stale value and Vue serves that value on the next read, which is exactly the "new ref, old data" exposure
  // the read-through exists to prevent. The throw therefore sits outside the computed graph, gated by a boolean
  // that only flips when the miss itself does — so patches never wake a reader through it.
  const guard = () => {
    if (missing.value) {
      throw new Error('Fragment data not found');
    }
  };

  return {
    get data() {
      guard();
      return data.value;
    },
    get metadata() {
      guard();
      return metadata.value;
    },
  };
}) as unknown as UseFragmentFn;
