import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import type { Client, FragmentRefs, OperationResult } from '@mearie/core';
import { FragmentRefKey, FragmentVarsKey } from '@mearie/core';
import { fromValue, makeSubject } from '@mearie/core/stream';
import type { Sink, Subscription } from '@mearie/core/stream';
import { useFragment } from './use-fragment.ts';
import { createMockClient, renderHook, renderHookWithProps, mockFragment, makeResult } from './test-utils.ts';

const createFragmentRef = (name = 'TestFragment'): FragmentRefs<string> => ({
  ' $fragmentRefs': { [name]: true as const },
});

const createSyncFragmentClient = (initialResult: OperationResult) => {
  const { client } = createMockClient();
  const subject = makeSubject<OperationResult>();

  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(client.executeFragment).mockImplementation(() => (sink: Sink<OperationResult>): Subscription => {
    sink.next(initialResult);
    const sub = subject.source(sink);
    return sub;
  });

  return { client, subject };
};

describe('useFragment', () => {
  it('should read a single fragment ref', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = renderHook(() => useFragment(mockFragment, ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    unmount();
  });

  it('should read an array of fragment refs', () => {
    const refs = [createFragmentRef(), createFragmentRef()];
    const initialResult = makeResult([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = renderHook(() => useFragment(mockFragment, refs), client);

    expect(result.current.data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    unmount();
  });

  it('should return null for null/undefined ref', () => {
    const { client } = createMockClient();
    const { result, unmount } = renderHook(() => useFragment(mockFragment, null), client);

    expect(result.current.data).toBeNull();
    unmount();
  });

  it('should throw when fragment data is not found', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const initialResult = makeResult(undefined);
    const { client } = createSyncFragmentClient(initialResult);

    expect(() => {
      renderHook(() => useFragment(mockFragment, createFragmentRef()), client);
    }).toThrow('Fragment data not found');
  });

  it('should update on patch-based changes', () => {
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, unmount } = renderHook(() => useFragment(mockFragment, ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });

    act(() => {
      subject.next(
        makeResult(undefined, {
          metadata: {
            cache: {
              patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
            },
          },
        }),
      );
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should provide synchronous initial data via peek', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Sync' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = renderHook(() => useFragment(mockFragment, ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Sync' });
    unmount();
  });

  it('should expose metadata', () => {
    const ref = createFragmentRef();
    const testMetadata = { cache: { stale: true } };
    const initialResult = makeResult({ id: '1' }, { metadata: testMetadata });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, unmount } = renderHook(() => useFragment(mockFragment, ref), client);

    expect(result.current.metadata).toEqual(testMetadata);
    unmount();
  });
});

const createIdentityRef = (storageKey: string): FragmentRefs<string> =>
  ({ [FragmentRefKey]: storageKey }) as unknown as FragmentRefs<string>;

const readStorageKey = (ref: unknown) => (ref as Record<string, unknown>)[FragmentRefKey] as string;

const mockByIdentity = (client: Client) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) => {
    const storageKey = readStorageKey(ref);
    return fromValue(makeResult({ id: storageKey, name: storageKey === 'Entity:a' ? 'first' : 'second' }));
  });
};

describe('useFragment ref transitions', () => {
  it('serves the new ref data in the same render, never the old ref data', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const refs: Record<string, FragmentRefs<string>> = {
      a: createIdentityRef('Entity:a'),
      b: createIdentityRef('Entity:b'),
    };

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { id: string }) => useFragment(mockFragment, refs[props.id]!),
      { id: 'a' },
      client,
    );

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    rerender({ id: 'b' });

    expect(result.current.data).toEqual({ id: 'Entity:b', name: 'second' });
    unmount();
  });

  it('never lets the render that sees the new ref observe the old ref data', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const refs: Record<string, FragmentRefs<string>> = {
      a: createIdentityRef('Entity:a'),
      b: createIdentityRef('Entity:b'),
    };
    const observed: { id: string; name: string }[] = [];

    const { rerender, unmount } = renderHookWithProps(
      (props: { id: string }) => {
        const ref = refs[props.id]!;
        const fragment = useFragment(mockFragment, ref);
        observed.push({ id: readStorageKey(ref), name: (fragment.data as { name: string }).name });
        return fragment;
      },
      { id: 'a' },
      client,
    );

    rerender({ id: 'b' });

    expect(observed).not.toContainEqual({ id: 'Entity:b', name: 'first' });
    expect(observed).toContainEqual({ id: 'Entity:b', name: 'second' });
    unmount();
  });

  it('throws when a ref transition finds no data in the cache', () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) =>
      readStorageKey(ref) === 'Entity:a'
        ? fromValue(makeResult({ id: 'Entity:a', name: 'first' }))
        : // eslint-disable-next-line unicorn/no-useless-undefined
          fromValue(makeResult(undefined)),
    );

    const refs: Record<string, FragmentRefs<string>> = {
      a: createIdentityRef('Entity:a'),
      b: createIdentityRef('Entity:b'),
    };

    const { rerender } = renderHookWithProps(
      (props: { id: string }) => useFragment(mockFragment, refs[props.id]!),
      { id: 'a' },
      client,
    );

    expect(() => rerender({ id: 'b' })).toThrow('Fragment data not found');
  });

  it('keeps accepting emissions after an unrelated parent field changes', () => {
    const { client, subjects } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment)
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    // a re-projection hands the parent a brand-new ref object with the same identity (see cache/denormalize.ts)
    const createParentRef = (title: string) =>
      ({ [FragmentRefKey]: 'Entity:a', title }) as unknown as FragmentRefs<string>;

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { title: string }) => useFragment(mockFragment, createParentRef(props.title)),
      { title: 'before' },
      client,
    );

    expect(result.current.data).toEqual({ id: '1', name: 'first' });

    rerender({ title: 'after' });

    // the sibling field is not part of the identity: no key change, so no re-read and no resubscription
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    act(() => {
      subjects.fragment.next(
        makeResult(undefined, {
          metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
        }),
      );
    });

    expect(result.current.data).toEqual({ id: '1', name: 'second' });
    unmount();
  });

  it('keeps the data reference stable across re-renders that do not change the ref identity', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const createParentRef = (title: string) =>
      ({ [FragmentRefKey]: 'Entity:a', title }) as unknown as FragmentRefs<string>;

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { title: string }) => useFragment(mockFragment, createParentRef(props.title)),
      { title: 'before' },
      client,
    );

    const first = result.current.data;

    rerender({ title: 'after' });

    expect(result.current.data).toBe(first);
    unmount();
  });

  it('resubscribes when only the fragment arguments change', () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) => {
      const vars = (ref as Record<string, Record<string, { limit: number }> | undefined>)[FragmentVarsKey]?.[
        mockFragment.name
      ];
      return fromValue(makeResult({ id: 'Entity:a', limit: vars?.limit ?? 0 }));
    });

    const createVarsRef = (limit: number) =>
      ({
        [FragmentRefKey]: 'Entity:a',
        [FragmentVarsKey]: { [mockFragment.name]: { limit } },
      }) as unknown as FragmentRefs<string>;

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { limit: number }) => useFragment(mockFragment, createVarsRef(props.limit)),
      { limit: 10 },
      client,
    );

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 10 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    rerender({ limit: 20 });

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 20 });
    // read-through in the render that sees the new arguments, then the resubscription
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('re-keys a keyless ref by content, not by object identity', () => {
    const { client } = createMockClient();
    // faithful echo branch: keyless refs get a one-shot result carrying the ref itself, with no cache listener
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) =>
      fromValue(makeResult(ref)),
    );

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { title: string }) =>
        useFragment(mockFragment, { title: props.title } as unknown as FragmentRefs<string>),
      { title: 'before' },
      client,
    );

    expect(result.current.data).toEqual({ title: 'before' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    // a new object with identical content is the same fragment: no re-read, no resubscription
    rerender({ title: 'before' });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    rerender({ title: 'after' });

    expect(result.current.data).toEqual({ title: 'after' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('clears to null atomically for optional fragments', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const refs: Record<string, FragmentRefs<string> | null> = { a: createIdentityRef('Entity:a'), none: null };

    const { result, rerender, unmount } = renderHookWithProps(
      (props: { id: string }) => useFragment(mockFragment, refs[props.id]!),
      { id: 'a' },
      client,
    );

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    rerender({ id: 'none' });

    expect(result.current.data).toBeNull();
    unmount();
  });
});
