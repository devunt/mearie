import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import type { FragmentRefs, OperationResult } from '@mearie/core';
import type { Sink, Source } from '@mearie/core/stream';
import { makeSubject } from '@mearie/core/stream';
import { useFragment } from './use-fragment.ts';
import { createMockClient, withSetup, mockFragment, makeResult } from './test-utils.ts';

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
