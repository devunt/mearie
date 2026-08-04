import { describe, it, expect, vi } from 'vitest';
import { nextTick, ref, watchEffect } from 'vue';
import type { FragmentRefs, OperationResult } from '@mearie/core';
import type { Sink, Source } from '@mearie/core/stream';
import { fromValue, makeSubject } from '@mearie/core/stream';
import { useFragment } from './use-fragment.ts';
import { createMockClient, withSetup, mockFragment, makeResult } from './test-utils.ts';

type MockClient = ReturnType<typeof createMockClient>['client'];

const FragmentRefKey = '__fragmentRef' as const;
const FragmentVarsKey = '__fragmentVars' as const;

const createFragmentRef = (): FragmentRefs<'TestFragment'> => ({
  ' $fragmentRefs': { TestFragment: true },
});

const createSyncFragmentClient = (initialResult: OperationResult) => {
  const { client } = createMockClient();
  const subject = makeSubject<OperationResult>();

  client.executeFragment.mockImplementation(
    (): Source<OperationResult> => (sink: Sink<OperationResult>) => {
      sink.next(initialResult);
      const sub = subject.source(sink);
      return sub;
    },
  );

  return { client, subject };
};

describe('useFragment', () => {
  it('should read a single fragment ref', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = withSetup(() => useFragment(mockFragment, ref), client);

    expect(result.data).toEqual({ id: '1', name: 'Alice' });
    unmount();
  });

  it('should read an array of fragment refs', () => {
    const refs = [createFragmentRef(), createFragmentRef()];
    const initialResult = makeResult([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = withSetup(() => useFragment(mockFragment, refs), client);

    expect(result.data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    unmount();
  });

  it('should return null for null/undefined ref', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useFragment(mockFragment, null), client);

    expect(result.data).toBeNull();
    unmount();
  });

  it('should throw when fragment data is not found', () => {
    const errorResult = makeResult(void 0);
    const { client } = createSyncFragmentClient(errorResult);

    expect(() => {
      withSetup(() => useFragment(mockFragment, createFragmentRef()), client);
    }).toThrow('Fragment data not found');
  });

  it('should update on patch-based changes', async () => {
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, unmount } = withSetup(() => useFragment(mockFragment, ref), client);

    expect(result.data).toEqual({ id: '1', name: 'Alice' });

    subject.next(
      makeResult(undefined, {
        metadata: {
          cache: {
            patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
          },
        },
      }),
    );
    await nextTick();

    expect(result.data).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should provide synchronous initial data via peek', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Sync' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = withSetup(() => useFragment(mockFragment, ref), client);

    expect(result.data).toEqual({ id: '1', name: 'Sync' });
    unmount();
  });

  it('should expose metadata', () => {
    const ref = createFragmentRef();
    const testMetadata = { cache: { stale: true } };
    const initialResult = makeResult({ id: '1' }, { metadata: testMetadata });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = withSetup(() => useFragment(mockFragment, ref), client);

    expect(result.metadata).toEqual(testMetadata);
    unmount();
  });
});

const createIdentityRef = (storageKey: string): FragmentRefs<'TestFragment'> =>
  ({ [FragmentRefKey]: storageKey }) as unknown as FragmentRefs<'TestFragment'>;

const readStorageKey = (refValue: unknown) => (refValue as Record<string, unknown>)[FragmentRefKey] as string;

const mockByIdentity = (client: MockClient) => {
  client.executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) => {
    const storageKey = readStorageKey(refValue);
    return fromValue(makeResult({ id: storageKey, name: storageKey === 'Entity:a' ? 'first' : 'second' }));
  });
};

describe('useFragment ref transitions', () => {
  it('serves the new ref data synchronously, never the old ref data', async () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const box = ref<FragmentRefs<'TestFragment'>>(createIdentityRef('Entity:a'));
    const { result, unmount } = withSetup(() => useFragment(mockFragment, () => box.value), client);

    expect(result.data).toEqual({ id: 'Entity:a', name: 'first' });

    box.value = createIdentityRef('Entity:b');

    // before any flush: the subscription has not moved yet, so the read must resolve through the cache
    expect(result.data).toEqual({ id: 'Entity:b', name: 'second' });

    await nextTick();

    expect(result.data).toEqual({ id: 'Entity:b', name: 'second' });
    unmount();
  });

  it('never lets a reader that runs before the hook observe the new ref with the old ref data', async () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const box = ref<FragmentRefs<'TestFragment'>>(createIdentityRef('Entity:a'));
    const observed: { id: string; name: string }[] = [];
    let fragment: { data: unknown } | undefined;

    const { unmount } = withSetup(() => {
      watchEffect(() => {
        const id = readStorageKey(box.value);
        observed.push({ id, name: fragment ? (fragment.data as { name: string }).name : 'none' });
      });

      fragment = useFragment(mockFragment, () => box.value) as { data: unknown };
      return fragment;
    }, client);

    box.value = createIdentityRef('Entity:b');
    await nextTick();

    expect(observed).not.toContainEqual({ id: 'Entity:b', name: 'first' });
    expect(observed).toContainEqual({ id: 'Entity:b', name: 'second' });
    unmount();
  });

  it('throws when a ref transition finds no data in the cache', async () => {
    const { client } = createMockClient();
    client.executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) =>
      readStorageKey(refValue) === 'Entity:a'
        ? fromValue(makeResult({ id: 'Entity:a', name: 'first' }))
        : fromValue(makeResult(void 0)),
    );

    const box = ref<FragmentRefs<'TestFragment'>>(createIdentityRef('Entity:a'));
    const { result, unmount } = withSetup(() => useFragment(mockFragment, () => box.value), client);

    expect(result.data).toEqual({ id: 'Entity:a', name: 'first' });

    box.value = createIdentityRef('Entity:b');

    expect(() => result.data).toThrow('Fragment data not found');

    await nextTick();

    expect(() => result.data).toThrow('Fragment data not found');
    unmount();
  });

  it('does not resubscribe when a re-projection replaces the ref with the same identity', async () => {
    const { client, subjects } = createMockClient();
    client.executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    // a re-projection hands the parent a brand-new ref object with the same identity (see cache/denormalize.ts)
    const createParentRef = (title: string) =>
      ({ [FragmentRefKey]: 'Entity:a', title }) as unknown as FragmentRefs<'TestFragment'>;

    const box = ref<FragmentRefs<'TestFragment'>>(createParentRef('before'));
    const { result, unmount } = withSetup(() => useFragment(mockFragment, () => box.value), client);

    expect(result.data).toEqual({ id: '1', name: 'first' });
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    box.value = createParentRef('after');
    await nextTick();

    // the sibling field is not part of the identity: no key change, so no re-read and no resubscription
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    await nextTick();

    expect(result.data).toEqual({ id: '1', name: 'second' });
    unmount();
  });

  it('resubscribes when only the fragment arguments change', async () => {
    const { client } = createMockClient();
    client.executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) => {
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

    const box = ref<FragmentRefs<'TestFragment'>>(createVarsRef(10));
    const { result, unmount } = withSetup(() => useFragment(mockFragment, () => box.value), client);

    expect(result.data).toEqual({ id: 'Entity:a', limit: 10 });
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    box.value = createVarsRef(20);
    await nextTick();

    expect(result.data).toEqual({ id: 'Entity:a', limit: 20 });
    expect(client.executeFragment).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('re-keys a keyless ref when its content is mutated in place', async () => {
    const { client } = createMockClient();
    // faithful echo branch: keyless refs get a one-shot result carrying the ref itself, with no cache listener.
    // The echo must not read the ref's fields: only the key derivation may depend on them, and the call count
    // below is what proves the content fallback re-keys.
    client.executeFragment.mockImplementation((_fragment: unknown, refValue: unknown) =>
      fromValue(makeResult(refValue)),
    );

    const box = ref({ title: 'before' });
    const { result, unmount } = withSetup(
      () => useFragment(mockFragment, () => box.value as unknown as FragmentRefs<'TestFragment'>),
      client,
    );

    expect(result.data).toEqual({ title: 'before' });
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    box.value.title = 'after';
    await nextTick();

    expect(result.data).toEqual({ title: 'after' });
    expect(client.executeFragment).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('clears to null atomically for optional fragments', async () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const box = ref<FragmentRefs<'TestFragment'> | null>(createIdentityRef('Entity:a'));
    const { result, unmount } = withSetup(() => useFragment(mockFragment, () => box.value), client);

    expect(result.data).toEqual({ id: 'Entity:a', name: 'first' });

    box.value = null;

    expect(result.data).toBeNull();

    await nextTick();

    expect(result.data).toBeNull();
    unmount();
  });
});

describe('useFragment fine-grained reactivity', () => {
  it('re-runs only the readers of the patched field', async () => {
    const { client, subjects } = createMockClient();
    client.executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first', other: 'one' })))
      .mockImplementation(() => subjects.fragment.source);

    const fragmentRef = createFragmentRef();
    let nameRuns = 0;
    let otherRuns = 0;
    let seenName: unknown;

    const { unmount } = withSetup(() => {
      const fragment = useFragment(mockFragment, fragmentRef);

      watchEffect(() => {
        seenName = (fragment.data as { name?: string } | null)?.name;
        nameRuns += 1;
      });

      watchEffect(() => {
        void (fragment.data as { other?: string } | null)?.other;
        otherRuns += 1;
      });

      return fragment;
    }, client);

    expect(nameRuns).toBe(1);
    expect(otherRuns).toBe(1);
    expect(seenName).toBe('first');

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'two' }] } },
      }),
    );
    await nextTick();

    expect(otherRuns).toBe(2);
    expect(nameRuns).toBe(1);
    expect(seenName).toBe('first');

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    await nextTick();

    expect(nameRuns).toBe(2);
    expect(seenName).toBe('second');
    expect(otherRuns).toBe(2);
    unmount();
  });

  it('serves null without a reactivity warning when a root patch replaces the data with null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, subjects } = createMockClient();
    client.executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    const { result, unmount } = withSetup(() => useFragment(mockFragment, createFragmentRef()), client);

    expect(result.data).toEqual({ id: '1', name: 'first' });

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: [], value: null }] } },
      }),
    );
    await nextTick();

    expect(result.data).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    unmount();
  });

  it('does not resubscribe when the first emission carries patches', async () => {
    const { client, subjects } = createMockClient();
    client.executeFragment
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(
        (): Source<OperationResult> => (sink: Sink<OperationResult>) => {
          sink.next(
            makeResult(undefined, {
              metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
            }),
          );
          return subjects.fragment.source(sink);
        },
      );

    const { result, unmount } = withSetup(() => useFragment(mockFragment, createFragmentRef()), client);

    expect(result.data).toEqual({ id: '1', name: 'second' });
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    subjects.fragment.next(makeResult({ id: '1', name: 'third' }));
    await nextTick();

    expect(result.data).toEqual({ id: '1', name: 'third' });
    expect(client.executeFragment).toHaveBeenCalledTimes(2);
    unmount();
  });
});
