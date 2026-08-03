import { describe, it, expect, type Mock } from 'vitest';
import { createComputed, createEffect, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { fromValue, makeSubject, type Sink, type Subscription } from '@mearie/core/stream';
import type { FragmentRefs, OperationResult } from '@mearie/core';
import { FragmentRefKey, FragmentVarsKey } from '@mearie/core';
import { createFragment } from './create-fragment.ts';
import { createMockClient, renderPrimitive, mockFragment, makeResult } from './test-utils.tsx';

const createFragmentRef = <T extends string = 'TestFragment'>(name: T = 'TestFragment' as T) => ({
  ' $fragmentRefs': { [name]: true as const } as Record<T, true>,
});

const createSyncFragmentClient = (initialResult: OperationResult) => {
  const { client } = createMockClient();
  const subject = makeSubject<OperationResult>();

  (client.executeFragment as unknown as Mock).mockImplementation(() => (sink: Sink<OperationResult>): Subscription => {
    sink.next(initialResult);
    const sub = subject.source(sink);
    return sub;
  });

  return { client, subject };
};

describe('createFragment', () => {
  it('should read a single fragment ref', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    dispose();
  });

  it('should read an array of fragment refs', () => {
    const refs = [createFragmentRef(), createFragmentRef()];
    const initialResult = makeResult([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    const { client } = createSyncFragmentClient(initialResult);

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => refs), client);

    expect(result.current.data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    dispose();
  });

  it('should return null for null/undefined ref', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => null), client);

    expect(result.current.data).toBeNull();
    dispose();
  });

  it('should throw when fragment data is not found', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const initialResult = makeResult(undefined);
    const { client } = createSyncFragmentClient(initialResult);

    expect(() => {
      renderPrimitive(() => createFragment(mockFragment, () => createFragmentRef()), client);
    }).toThrow('Fragment data not found');
  });

  it('should update on patch-based changes', () => {
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });

    subject.next(
      makeResult(undefined, {
        metadata: {
          cache: {
            patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
          },
        },
      }),
    );

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    dispose();
  });

  it('should provide synchronous initial data via peek', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Sync' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Sync' });
    dispose();
  });

  it('should expose metadata', () => {
    const ref = createFragmentRef();
    const testMetadata = { cache: { stale: true } };
    const initialResult = makeResult({ id: '1' }, { metadata: testMetadata });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});

const withFragmentMock = () => {
  const { client, subjects } = createMockClient();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const executeFragment = client.executeFragment as unknown as Mock;
  return { client, subjects, executeFragment };
};

const createIdentityRef = (storageKey: string) =>
  ({ [FragmentRefKey]: storageKey }) as unknown as FragmentRefs<'TestFragment'>;

const readStorageKey = (refValue: unknown) => (refValue as Record<string, unknown>)[FragmentRefKey] as string;

const mockByIdentity = (executeFragment: Mock) => {
  executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) => {
    const storageKey = readStorageKey(refValue);
    return fromValue(makeResult({ id: storageKey, name: storageKey === 'Entity:a' ? 'first' : 'second' }));
  });
};

const patchResult = (path: (string | number)[], value: unknown) =>
  makeResult(undefined, { metadata: { cache: { patches: [{ type: 'set', path, value }] } } });

describe('createFragment ref transitions', () => {
  it('serves the new ref data synchronously, never the old ref data', () => {
    const { client, executeFragment } = withFragmentMock();
    mockByIdentity(executeFragment);

    const [target, setTarget] = createSignal(createIdentityRef('Entity:a'));
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, target), client);

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    setTarget(createIdentityRef('Entity:b'));

    expect(result.current.data).toEqual({ id: 'Entity:b', name: 'second' });
    dispose();
  });

  it('never lets a reader that runs before the hook observe the new ref with the old ref data', () => {
    const { client, executeFragment } = withFragmentMock();
    mockByIdentity(executeFragment);

    const [target, setTarget] = createSignal(createIdentityRef('Entity:a'));
    const observed: { id: string; name: string }[] = [];
    let fragment: { data: unknown } | undefined;

    const { dispose } = renderPrimitive(() => {
      // created first, so it is enqueued ahead of everything createFragment builds
      createComputed(() => {
        const id = readStorageKey(target());
        observed.push({ id, name: fragment ? (fragment.data as { name: string }).name : 'none' });
      });

      fragment = createFragment(mockFragment, target) as { data: unknown };
      return fragment;
    }, client);

    setTarget(createIdentityRef('Entity:b'));

    expect(observed).not.toContainEqual({ id: 'Entity:b', name: 'first' });
    expect(observed).toContainEqual({ id: 'Entity:b', name: 'second' });
    dispose();
  });

  it('throws when a ref transition finds no data in the cache', () => {
    const { client, executeFragment } = withFragmentMock();
    executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) =>
      readStorageKey(refValue) === 'Entity:a'
        ? fromValue(makeResult({ id: 'Entity:a', name: 'first' }))
        : // eslint-disable-next-line unicorn/no-useless-undefined
          fromValue(makeResult(undefined)),
    );

    const [target, setTarget] = createSignal(createIdentityRef('Entity:a'));
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, target), client);

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    setTarget(createIdentityRef('Entity:b'));

    // the miss belongs to the reader and must fire on every read: a memo that threw stamps itself as
    // already-updated, so a downstream memo would otherwise resolve to the previous ref's data
    expect(() => result.current.data).toThrow('Fragment data not found');
    expect(() => result.current.data).toThrow('Fragment data not found');
    expect(() => result.current.metadata).toThrow('Fragment data not found');

    // and the gate is not latched: a ref that does resolve clears it
    setTarget(createIdentityRef('Entity:a'));

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });
    dispose();
  });

  it('does not resubscribe when a re-projection replaces the ref with the same identity', () => {
    const { client, subjects, executeFragment } = withFragmentMock();
    executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    // a re-projection hands the parent a brand-new ref object with the same identity (see cache/denormalize.ts)
    const createParentRef = (title: string) =>
      ({ [FragmentRefKey]: 'Entity:a', title }) as unknown as FragmentRefs<'TestFragment'>;

    const [target, setTarget] = createSignal(createParentRef('before'));
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, target), client);

    expect(result.current.data).toEqual({ id: '1', name: 'first' });
    expect(executeFragment).toHaveBeenCalledTimes(2);

    setTarget(createParentRef('after'));

    // the sibling field is not part of the identity: no key change, so no re-read and no resubscription
    expect(executeFragment).toHaveBeenCalledTimes(2);

    subjects.fragment.next(patchResult(['name'], 'second'));

    expect(result.current.data).toEqual({ id: '1', name: 'second' });
    dispose();
  });

  it('does not re-key when an unrelated field of the parent store node is patched', () => {
    const { client, subjects, executeFragment } = withFragmentMock();
    executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    const [parentNode, setParentNode] = createStore<Record<string, unknown>>({
      [FragmentRefKey]: 'Entity:a',
      title: 'before',
    });

    const { result, dispose } = renderPrimitive(
      () => createFragment(mockFragment, () => parentNode as unknown as FragmentRefs<'TestFragment'>),
      client,
    );

    expect(result.current.data).toEqual({ id: '1', name: 'first' });
    expect(executeFragment).toHaveBeenCalledTimes(2);

    setParentNode('title', 'after');

    // the key memo reads only the storage key and this fragment's own arguments off the parent's store
    // node, so a sibling leaf patch is not one of its dependencies
    expect(executeFragment).toHaveBeenCalledTimes(2);

    subjects.fragment.next(patchResult(['name'], 'second'));

    expect(result.current.data).toEqual({ id: '1', name: 'second' });
    dispose();
  });

  it('resubscribes when only the fragment arguments change', () => {
    const { client, executeFragment } = withFragmentMock();
    executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) => {
      const vars = (refValue as Record<string, Record<string, { limit: number }> | undefined>)[FragmentVarsKey]?.[
        mockFragment.name
      ];
      return fromValue(makeResult({ id: 'Entity:a', limit: vars?.limit ?? 0 }));
    });

    const createVarsRef = (limit: number) =>
      ({
        [FragmentRefKey]: 'Entity:a',
        [FragmentVarsKey]: { [mockFragment.name]: { limit } },
      }) as unknown as FragmentRefs<'TestFragment'>;

    const [target, setTarget] = createSignal(createVarsRef(10));
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, target), client);

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 10 });
    expect(executeFragment).toHaveBeenCalledTimes(2);

    setTarget(createVarsRef(20));

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 20 });
    // the read-through for the reader that sees the new arguments, then the resubscription
    expect(executeFragment).toHaveBeenCalledTimes(4);
    dispose();
  });

  it('re-keys a keyless ref when its content changes', () => {
    const { client, executeFragment } = withFragmentMock();
    // faithful echo branch: keyless refs get a one-shot result carrying the ref itself, with no cache
    // listener. The echo copies the ref so the emission never carries a store proxy back into the store.
    executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) =>
      fromValue(makeResult({ ...(refValue as Record<string, unknown>) })),
    );

    const [box, setBox] = createStore<{ title: string }>({ title: 'before' });
    const { result, dispose } = renderPrimitive(
      () => createFragment(mockFragment, () => box as unknown as FragmentRefs<'TestFragment'>),
      client,
    );

    expect(result.current.data).toEqual({ title: 'before' });
    expect(executeFragment).toHaveBeenCalledTimes(2);

    setBox('title', 'after');

    // a keyless ref has no identity to key by, so its content is the identity and must be read deeply
    expect(result.current.data).toEqual({ title: 'after' });
    expect(executeFragment).toHaveBeenCalledTimes(4);
    dispose();
  });

  it('keys a list by element identity and order', () => {
    const { client, executeFragment } = withFragmentMock();
    executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) =>
      fromValue(makeResult((refValue as unknown[]).map((element) => ({ id: readStorageKey(element) })))),
    );

    const [order, setOrder] = createSignal(['Entity:a', 'Entity:b']);
    const { result, dispose } = renderPrimitive(
      () => createFragment(mockFragment, () => order().map((storageKey) => createIdentityRef(storageKey))),
      client,
    );

    expect(result.current.data).toEqual([{ id: 'Entity:a' }, { id: 'Entity:b' }]);
    expect(executeFragment).toHaveBeenCalledTimes(2);

    // a new array of new element objects with the same identities is the same list
    setOrder(['Entity:a', 'Entity:b']);

    expect(executeFragment).toHaveBeenCalledTimes(2);

    setOrder(['Entity:b', 'Entity:a']);

    expect(result.current.data).toEqual([{ id: 'Entity:b' }, { id: 'Entity:a' }]);
    expect(executeFragment).toHaveBeenCalledTimes(4);
    dispose();
  });

  it('clears to null atomically for optional fragments', () => {
    const { client, executeFragment } = withFragmentMock();
    mockByIdentity(executeFragment);

    const [target, setTarget] = createSignal<FragmentRefs<'TestFragment'> | null>(createIdentityRef('Entity:a'));
    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, target), client);

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    setTarget(null);

    expect(result.current.data).toBeNull();
    expect(result.current.metadata).toBeUndefined();
    dispose();
  });
});

describe('createFragment fine-grained reactivity', () => {
  it('serves the new root when a root-level set patch replaces the payload', () => {
    const initialResult = makeResult({ id: '1', name: 'first' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, dispose } = renderPrimitive(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'first' });

    subject.next(patchResult([], { id: '2', name: 'second' }));

    expect(result.current.data).toEqual({ id: '2', name: 'second' });

    // and the replaced root keeps accepting nested patches
    subject.next(patchResult(['name'], 'third'));

    expect(result.current.data).toEqual({ id: '2', name: 'third' });
    dispose();
  });

  it('re-runs only the effects that read the patched field', () => {
    const { client, subjects, executeFragment } = withFragmentMock();
    executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first', other: 'one' })))
      .mockImplementation(() => subjects.fragment.source);

    const ref = createFragmentRef();
    let nameRuns = 0;
    let otherRuns = 0;
    let seenName: unknown;

    const { result, dispose } = renderPrimitive(() => {
      const fragment = createFragment(mockFragment, () => ref);

      createEffect(() => {
        seenName = (fragment.data as { name?: string }).name;
        nameRuns += 1;
      });

      createEffect(() => {
        void (fragment.data as { other?: string }).other;
        otherRuns += 1;
      });

      return fragment;
    }, client);

    expect(nameRuns).toBe(1);
    expect(otherRuns).toBe(1);
    expect(seenName).toBe('first');

    subjects.fragment.next(patchResult(['other'], 'two'));

    expect(otherRuns).toBe(2);
    expect(nameRuns).toBe(1);
    expect(seenName).toBe('first');

    subjects.fragment.next(patchResult(['name'], 'second'));

    expect(nameRuns).toBe(2);
    expect(seenName).toBe('second');
    expect(otherRuns).toBe(2);
    expect(result.current.data).toEqual({ id: '1', name: 'second', other: 'two' });
    dispose();
  });
});
