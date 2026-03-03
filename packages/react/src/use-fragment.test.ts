import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import type { FragmentRefs, OperationResult } from '@mearie/core';
import { makeSubject } from '@mearie/core/stream';
import type { Sink, Subscription } from '@mearie/core/stream';
import { useFragment } from './use-fragment.ts';
import { createMockClient, renderHook, mockFragment, makeResult } from './test-utils.ts';

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
