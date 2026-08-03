import { describe, it, expect, vi as vitest } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Artifact } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { useSubscription } from './use-subscription.ts';
import { createMockClient, withSetup, mockSubscription, makeResult } from './test-utils.ts';

type MockSubscriptionWithVars = Artifact<'subscription', string, unknown, { ch: string }>;

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

describe('useSubscription data ownership', () => {
  it('resets data atomically when variables change and waits for the first event of the new key', async () => {
    const { client, subjects } = createMockClient();
    const ch = ref('a');
    const composable = () => useSubscription(mockSubscription as MockSubscriptionWithVars, () => ({ ch: ch.value }));
    const { result, unmount } = withSetup(composable, client);

    subjects.subscription.next(makeResult({ ch: 'a', seq: 1 }));
    await nextTick();
    expect(result.data.value).toEqual({ ch: 'a', seq: 1 });
    expect(result.loading.value).toBe(false);

    ch.value = 'b';
    await nextTick();

    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(true);
    expect(result.error.value).toBeUndefined();
    expect(result.previousData.value).toEqual({ ch: 'a', seq: 1 });

    subjects.subscription.next(makeResult({ ch: 'b', seq: 1 }));
    await nextTick();

    expect(result.data.value).toEqual({ ch: 'b', seq: 1 });
    expect(result.loading.value).toBe(false);
    expect(result.previousData.value).toEqual({ ch: 'a', seq: 1 });
    unmount();
  });

  it('stops loading when skip becomes true mid-flight', async () => {
    const { client } = createMockClient();
    const skip = ref(false);
    const composable = () => useSubscription(mockSubscription, undefined, () => ({ skip: skip.value }));
    const { result, unmount } = withSetup(composable, client);

    expect(result.loading.value).toBe(true);

    skip.value = true;
    await nextTick();

    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('keeps data while skipped when the key is unchanged', async () => {
    const { client, subjects } = createMockClient();
    const ch = ref('a');
    const skip = ref(false);
    const composable = () =>
      useSubscription(
        mockSubscription as MockSubscriptionWithVars,
        () => ({ ch: ch.value }),
        () => ({ skip: skip.value }),
      );
    const { result, unmount } = withSetup(composable, client);

    subjects.subscription.next(makeResult({ ch: 'a', seq: 1 }));
    await nextTick();
    expect(result.data.value).toEqual({ ch: 'a', seq: 1 });

    skip.value = true;
    await nextTick();
    expect(result.data.value).toEqual({ ch: 'a', seq: 1 });
    expect(result.loading.value).toBe(false);

    ch.value = 'b';
    await nextTick();

    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
    expect(result.previousData.value).toEqual({ ch: 'a', seq: 1 });
    unmount();
  });

  it('does not fire onData on reset, only on real events', async () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const ch = ref('a');
    const composable = () =>
      useSubscription(
        mockSubscription as MockSubscriptionWithVars,
        () => ({ ch: ch.value }),
        () => ({ onData }),
      );
    const { unmount } = withSetup(composable, client);

    subjects.subscription.next(makeResult({ ch: 'a', seq: 1 }));
    await nextTick();
    expect(onData).toHaveBeenCalledTimes(1);

    ch.value = 'b';
    await nextTick();
    expect(onData).toHaveBeenCalledTimes(1);

    subjects.subscription.next(makeResult({ ch: 'b', seq: 1 }));
    await nextTick();

    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith({ ch: 'b', seq: 1 });
    unmount();
  });

  it('fires onError instead of onData when a result carries errors', async () => {
    const onData = vitest.fn();
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = withSetup(() => useSubscription(mockSubscription, undefined, { onData, onError }), client);

    subjects.subscription.next(makeResult({ id: '1' }, { errors: [{ message: 'Boom' }] }));
    await nextTick();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();
    unmount();
  });
});
