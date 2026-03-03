import { describe, it, expect, vi as vitest } from 'vitest';
import { nextTick } from 'vue';
import { AggregatedError } from '@mearie/core';
import { useSubscription } from './use-subscription.ts';
import { createMockClient, withSetup, mockSubscription, makeResult } from './test-utils.ts';

describe('useSubscription', () => {
  it('should transition from loading to data', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription), client);

    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBeUndefined();

    subjects.subscription.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toEqual({ id: '1' });
    unmount();
  });

  it('should handle multiple emissions', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult({ count: 1 }));
    await nextTick();
    expect(result.data.value).toEqual({ count: 1 });

    subjects.subscription.next(makeResult({ count: 2 }));
    await nextTick();
    expect(result.data.value).toEqual({ count: 2 });

    subjects.subscription.next(makeResult({ count: 3 }));
    await nextTick();
    expect(result.data.value).toEqual({ count: 3 });
    unmount();
  });

  it('should handle errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Sub failed' }] }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeInstanceOf(AggregatedError);
    unmount();
  });

  it('should call onData callback', async () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = withSetup(() => useSubscription(mockSubscription, undefined, { onData }), client);

    subjects.subscription.next(makeResult({ id: '1' }));
    await nextTick();

    expect(onData).toHaveBeenCalledWith({ id: '1' });
    unmount();
  });

  it('should call onError callback', async () => {
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = withSetup(() => useSubscription(mockSubscription, undefined, { onError }), client);

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Error' }] }));
    await nextTick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AggregatedError));
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription, undefined, { skip: true }), client);

    expect(result.loading.value).toBe(false);
    expect(client.executeSubscription).not.toHaveBeenCalled();
    unmount();
  });

  it('should unsubscribe on unmount', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });

    unmount();

    subjects.subscription.next(makeResult({ id: '2' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useSubscription(mockSubscription), client);

    const testMetadata = { source: 'ws' };
    subjects.subscription.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    await nextTick();

    expect(result.metadata.value).toEqual(testMetadata);
    unmount();
  });
});
