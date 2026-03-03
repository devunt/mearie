import { describe, it, expect, vi as vitest } from 'vitest';
import { act } from 'react';
import { AggregatedError } from '@mearie/core';
import { useSubscription } from './use-subscription.ts';
import type { UseSubscriptionOptions } from './use-subscription.ts';
import { createMockClient, renderHook, mockSubscription, makeResult } from './test-utils.ts';

type MockSubscriptionOptions = UseSubscriptionOptions<typeof mockSubscription>;

describe('useSubscription', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    act(() => {
      subjects.subscription.next(makeResult({ id: '1' }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1' });
    unmount();
  });

  it('should handle multiple emissions', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription), client);

    act(() => {
      subjects.subscription.next(makeResult({ count: 1 }));
    });

    expect(result.current.data).toEqual({ count: 1 });

    act(() => {
      subjects.subscription.next(makeResult({ count: 2 }));
    });

    expect(result.current.data).toEqual({ count: 2 });

    act(() => {
      subjects.subscription.next(makeResult({ count: 3 }));
    });

    expect(result.current.data).toEqual({ count: 3 });
    unmount();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription), client);

    act(() => {
      subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Sub failed' }] }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    unmount();
  });

  it('should call onData callback', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = renderHook(
      () => useSubscription(mockSubscription, undefined, { onData } as MockSubscriptionOptions),
      client,
    );

    act(() => {
      subjects.subscription.next(makeResult({ id: '1' }));
    });

    expect(onData).toHaveBeenCalledWith({ id: '1' });
    unmount();
  });

  it('should call onError callback', () => {
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = renderHook(
      () => useSubscription(mockSubscription, undefined, { onError } as MockSubscriptionOptions),
      client,
    );

    act(() => {
      subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Error' }] }));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AggregatedError));
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription, undefined, { skip: true }), client);

    expect(result.current.loading).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeSubscription).not.toHaveBeenCalled();
    unmount();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription), client);

    act(() => {
      subjects.subscription.next(makeResult({ id: '1' }));
    });

    unmount();

    act(() => {
      subjects.subscription.next(makeResult({ id: '2' }));
    });

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useSubscription(mockSubscription), client);

    const testMetadata = { source: 'ws' };
    act(() => {
      subjects.subscription.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    });

    expect(result.current.metadata).toEqual(testMetadata);
    unmount();
  });
});
