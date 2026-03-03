import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { AggregatedError } from '@mearie/core';
import { useQuery } from './use-query.ts';
import { createMockClient, withSetup, mockQuery, makeResult } from './test-utils.ts';

describe('useQuery', () => {
  it('should transition from loading to data', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBeUndefined();

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toEqual({ id: '1', name: 'Alice' });
    expect(result.error.value).toBeUndefined();
    unmount();
  });

  it('should handle errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeInstanceOf(AggregatedError);
    expect(result.error.value!.errors[0]!.message).toBe('Not found');
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { skip: true }), client);

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toBeUndefined();
    expect(client.executeQuery).not.toHaveBeenCalled();
    unmount();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.data.value).toEqual(initialData);
    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('should update data after initialData when fetch completes', async () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.data.value).toEqual(initialData);
    expect(result.loading.value).toBe(false);

    subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Updated' });
    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('should re-execute on refetch', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    result.refetch();
    await nextTick();

    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.loading.value).toBe(true);
    unmount();
  });

  it('should unsubscribe on unmount', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });

    unmount();

    subjects.query.next(makeResult({ id: '2' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });
  });

  it('should update data on multiple results', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'First' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'First' });

    subjects.query.next(makeResult({ id: '1', name: 'Second' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Second' });
    unmount();
  });

  it('should apply patch-based updates', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Alice' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: {
          cache: {
            patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
          },
        },
      }),
    );
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    await nextTick();

    expect(result.metadata.value).toEqual(testMetadata);
    unmount();
  });
});
