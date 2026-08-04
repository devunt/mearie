import { describe, it, expect, vi } from 'vitest';
import { GraphQLError } from './errors.ts';
import { FragmentRefKey, FragmentVarsKey } from './cache/constants.ts';
import {
  computeObserverKey,
  initObserverState,
  beginFetch,
  acceptInitialData,
  trackInitialData,
  readElementIdentity,
  readRefIdentity,
  reduceObserverResult,
  reduceFragmentResult,
  deriveObserverView,
} from './observer.ts';
import type { OperationResult } from './exchange.ts';

const artifact = { name: 'TestQuery' };
const keyA = computeObserverKey(artifact, { id: 'a' });
const keyB = computeObserverKey(artifact, { id: 'b' });
const keyC = computeObserverKey(artifact, { id: 'c' });

const result = (
  data: unknown,
  opts?: { errors?: string[]; metadata?: OperationResult['metadata'] },
): OperationResult => ({
  data,
  errors: opts?.errors?.map((m) => new GraphQLError(m)),
  metadata: opts?.metadata,
  operation: {} as OperationResult['operation'],
});

describe('computeObserverKey', () => {
  it('is stable across property order and distinguishes variables', () => {
    expect(computeObserverKey(artifact, { a: 1, b: 2 })).toBe(computeObserverKey(artifact, { b: 2, a: 1 }));
    expect(keyA).not.toBe(keyB);
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(computeObserverKey(artifact, undefined)).toBe(computeObserverKey(artifact, undefined));
  });
});

describe('readRefIdentity', () => {
  const fragmentName = 'TestFragment';
  const keyedRef = (storageKey: string, args?: Record<string, unknown>, name = fragmentName) => ({
    [FragmentRefKey]: storageKey,
    ...(args && { [FragmentVarsKey]: { [name]: args } }),
  });

  it('reads a storage key and the fragment arguments from a single ref', () => {
    expect(readRefIdentity(keyedRef('Entity:1'), fragmentName)).toEqual(['Entity:1', undefined]);
    expect(readRefIdentity(keyedRef('Entity:1', { limit: 10 }), fragmentName)).toEqual(['Entity:1', { limit: 10 }]);
  });

  it('reads the arguments entry keyed by fragment name, ignoring other fragments', () => {
    const ref = keyedRef('Entity:1', { limit: 10 }, 'OtherFragment');
    expect(readRefIdentity(ref, fragmentName)).toEqual(['Entity:1', undefined]);
    expect(readRefIdentity(ref, 'OtherFragment')).toEqual(['Entity:1', { limit: 10 }]);
  });

  it('reads a list as order-preserving tuples', () => {
    expect(readRefIdentity([keyedRef('Entity:1'), keyedRef('Entity:2', { limit: 10 })], fragmentName)).toEqual([
      ['Entity:1', undefined],
      ['Entity:2', { limit: 10 }],
    ]);
  });

  it('gives up on the whole ref when any element carries no storage key', () => {
    expect(readRefIdentity({ title: 'keyless' }, fragmentName)).toBeUndefined();
    expect(readRefIdentity([keyedRef('Entity:1'), { title: 'keyless' }], fragmentName)).toBeUndefined();
    expect(readElementIdentity(null, fragmentName)).toBeUndefined();
    expect(readElementIdentity({ [FragmentRefKey]: 1 }, fragmentName)).toBeUndefined();
  });

  it('keys a list by order: the same elements reordered are a different observer', () => {
    const forward = readRefIdentity([keyedRef('Entity:1'), keyedRef('Entity:2')], fragmentName);
    const reversed = readRefIdentity([keyedRef('Entity:2'), keyedRef('Entity:1')], fragmentName);

    expect(computeObserverKey(artifact, forward)).not.toBe(computeObserverKey(artifact, reversed));
    expect(computeObserverKey(artifact, forward)).toBe(
      computeObserverKey(artifact, readRefIdentity([keyedRef('Entity:1'), keyedRef('Entity:2')], fragmentName)),
    );
  });
});

describe('deriveObserverView', () => {
  it('starts empty and loading when not skipped', () => {
    const view = deriveObserverView(initObserverState(), keyA, false);
    expect(view).toEqual({
      data: undefined,
      previousData: undefined,
      loading: true,
      error: undefined,
      metadata: undefined,
    });
  });

  it('is not loading when skipped', () => {
    expect(deriveObserverView(initObserverState(), keyA, true).loading).toBe(false);
  });

  it('exposes emission fields for the matching key only', () => {
    const state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    const match = deriveObserverView(state, keyA, false);
    expect(match.data).toEqual({ id: 'a', name: 'first' });
    expect(match.loading).toBe(false);

    const mismatch = deriveObserverView(state, keyB, false);
    expect(mismatch.data).toBeUndefined();
    expect(mismatch.error).toBeUndefined();
    expect(mismatch.metadata).toBeUndefined();
    expect(mismatch.loading).toBe(true);
    expect(mismatch.previousData).toEqual({ id: 'a', name: 'first' });
  });

  it('keeps loading true during an explicit fetch of the current key', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }));
    state = beginFetch(state);
    const view = deriveObserverView(state, keyA, false);
    expect(view.loading).toBe(true);
    expect(view.data).toEqual({ id: 'a' });
  });

  it('never reports loading while skipped, even mid-fetch', () => {
    const state = beginFetch(initObserverState());
    expect(deriveObserverView(state, keyA, true).loading).toBe(false);
  });
});

describe('previousData succession', () => {
  it('carries the previous key data across a transition, before and after acceptance', () => {
    const stateA = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }));
    expect(deriveObserverView(stateA, keyB, false).previousData).toEqual({ id: 'a' });

    const stateB = reduceObserverResult(stateA, keyB, result({ id: 'b' }));
    const view = deriveObserverView(stateB, keyB, false);
    expect(view.data).toEqual({ id: 'b' });
    expect(view.previousData).toEqual({ id: 'a' });
  });

  it('does not advance previousData on same-key updates', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }));
    state = reduceObserverResult(state, keyB, result({ id: 'b' }));
    state = reduceObserverResult(state, keyB, result({ id: 'b', v: 2 }));
    expect(deriveObserverView(state, keyB, false).previousData).toEqual({ id: 'a' });
  });

  it('carries a null-resolved key through previousData, before and after acceptance', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    state = reduceObserverResult(
      state,
      keyA,
      result(undefined, { metadata: { cache: { patches: [{ type: 'set', path: [], value: null }] } } }),
      { applyPatches: () => null },
    );

    expect(deriveObserverView(state, keyB, false).previousData).toBeNull();

    state = reduceObserverResult(state, keyB, result({ id: 'b' }));
    const view = deriveObserverView(state, keyB, false);
    expect(view.data).toEqual({ id: 'b' });
    expect(view.previousData).toBeNull();
  });

  it('skips keys that ended without data (A load -> B error-only -> C)', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }));
    state = reduceObserverResult(state, keyB, result(undefined, { errors: ['boom'] }));
    expect(deriveObserverView(state, keyC, false).previousData).toEqual({ id: 'a' });
    state = reduceObserverResult(state, keyC, result({ id: 'c' }));
    expect(deriveObserverView(state, keyC, false).previousData).toEqual({ id: 'a' });
  });
});

describe('reduceObserverResult', () => {
  it('attributes errors to the key and clears fetching', () => {
    let state = beginFetch(initObserverState());
    state = reduceObserverResult(state, keyA, result(undefined, { errors: ['boom'] }));
    const view = deriveObserverView(state, keyA, false);
    expect(view.error?.errors[0]?.message).toBe('boom');
    expect(view.loading).toBe(false);
    expect(view.data).toBeUndefined();
  });

  it('keeps same-key data on a subsequent error result', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }));
    state = reduceObserverResult(state, keyA, result(undefined, { errors: ['boom'] }));
    const view = deriveObserverView(state, keyA, false);
    expect(view.data).toEqual({ id: 'a' });
    expect(view.error).toBeDefined();
  });

  it('clears a previous error on a subsequent success', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result(undefined, { errors: ['boom'] }));
    state = reduceObserverResult(state, keyA, result({ id: 'a' }));
    const view = deriveObserverView(state, keyA, false);
    expect(view.error).toBeUndefined();
    expect(view.data).toEqual({ id: 'a' });
  });

  it('applies patches to matching-key data via the provided applier', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    state = reduceObserverResult(
      state,
      keyA,
      result(undefined, { metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } } }),
      {
        applyPatches: (data, patches) => {
          expect(patches).toHaveLength(1);
          return { ...(data as Record<string, unknown>), name: 'second' } as never;
        },
      },
    );
    expect(deriveObserverView(state, keyA, false).data).toEqual({ id: 'a', name: 'second' });
  });

  it('serves a null root from the applier instead of retaining stale data', () => {
    let state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    state = reduceObserverResult(
      state,
      keyA,
      result(undefined, { metadata: { cache: { patches: [{ type: 'set', path: [], value: null }] } } }),
      { applyPatches: () => null },
    );
    expect(deriveObserverView(state, keyA, false).data).toBeNull();
  });

  it('maps fresh full-result data through mapData', () => {
    const state = reduceObserverResult(initObserverState(), keyA, result({ id: 'a' }), {
      mapData: (d) => ({ ...(d as Record<string, unknown>), mapped: true }) as never,
    });
    expect(deriveObserverView(state, keyA, false).data).toEqual({ id: 'a', mapped: true });
  });
});

describe('acceptInitialData', () => {
  it('acts as an accepted emission: data present, not loading', () => {
    const state = acceptInitialData(initObserverState(), keyA, { id: 'a' });
    const view = deriveObserverView(state, keyA, false);
    expect(view.data).toEqual({ id: 'a' });
    expect(view.loading).toBe(false);
  });

  it('clears fetching', () => {
    const state = acceptInitialData(beginFetch(initObserverState()), keyA, { id: 'a' });
    expect(deriveObserverView(state, keyA, false).loading).toBe(false);
  });
});

describe('trackInitialData', () => {
  it('warns once when the same object reference is reused across different keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shared = { id: 'a' };
    const last = trackInitialData(undefined, keyA, shared);
    expect(warn).not.toHaveBeenCalled();
    trackInitialData(last, keyB, shared);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not warn when the same object reference is reused for the same key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shared = { id: 'a' };
    const last = trackInitialData(undefined, keyA, shared);
    trackInitialData(last, keyA, shared);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn when a different object reference is used for a different key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const last = trackInitialData(undefined, keyA, { id: 'a' });
    trackInitialData(last, keyB, { id: 'b' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('reduceFragmentResult', () => {
  it('replaces data on full results and keeps data on undefined-data results', () => {
    let state = reduceFragmentResult(initObserverState(), keyA, result({ id: 'a' }));
    expect(deriveObserverView(state, keyA, false).data).toEqual({ id: 'a' });
    state = reduceFragmentResult(state, keyA, result(undefined, { metadata: { cache: { stale: true } } }));
    const view = deriveObserverView(state, keyA, false);
    expect(view.data).toEqual({ id: 'a' });
    expect(view.metadata).toEqual({ cache: { stale: true } });
  });

  it('applies patches to matching-key data', () => {
    let state = reduceFragmentResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    state = reduceFragmentResult(
      state,
      keyA,
      result(undefined, { metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } } }),
      {
        applyPatches: (data) => ({ ...(data as Record<string, unknown>), name: 'second' }) as never,
      },
    );
    expect(deriveObserverView(state, keyA, false).data).toEqual({ id: 'a', name: 'second' });
  });

  it('serves a null root from the applier instead of retaining stale data', () => {
    let state = reduceFragmentResult(initObserverState(), keyA, result({ id: 'a', name: 'first' }));
    state = reduceFragmentResult(
      state,
      keyA,
      result(undefined, { metadata: { cache: { patches: [{ type: 'set', path: [], value: null }] } } }),
      { applyPatches: () => null },
    );
    expect(deriveObserverView(state, keyA, false).data).toBeNull();
  });
});
