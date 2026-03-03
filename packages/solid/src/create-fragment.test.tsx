import { describe, it, expect, type Mock } from 'vitest';
import { makeSubject, type Sink, type Subscription } from '@mearie/core/stream';
import type { OperationResult } from '@mearie/core';
import { createFragment } from './create-fragment.ts';
import { createMockClient, renderHook, mockFragment, makeResult } from './test-utils.tsx';

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

    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => ref), client);

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

    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => refs), client);

    expect(result.current.data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    dispose();
  });

  it('should return null for null/undefined ref', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => null), client);

    expect(result.current.data).toBeNull();
    dispose();
  });

  it('should throw when fragment data is not found', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const initialResult = makeResult(undefined);
    const { client } = createSyncFragmentClient(initialResult);

    expect(() => {
      renderHook(() => createFragment(mockFragment, () => createFragmentRef()), client);
    }).toThrow('Fragment data not found');
  });

  it('should update on patch-based changes', () => {
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => ref), client);

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

    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.data).toEqual({ id: '1', name: 'Sync' });
    dispose();
  });

  it('should expose metadata', () => {
    const ref = createFragmentRef();
    const testMetadata = { cache: { stale: true } };
    const initialResult = makeResult({ id: '1' }, { metadata: testMetadata });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, dispose } = renderHook(() => createFragment(mockFragment, () => ref), client);

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});
