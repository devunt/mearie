import { describe, it, expect, vi as vitest } from 'vitest';
import { act } from 'react';
import type { Artifact } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { useSubscription } from './use-subscription.ts';
import type { UseSubscriptionOptions } from './use-subscription.ts';
import { createMockClient, renderHook, renderHookWithProps, mockSubscription, makeResult } from './test-utils.ts';

type MockSubscriptionOptions = UseSubscriptionOptions<typeof mockSubscription>;
type MockSubscriptionWithVars = Artifact<'subscription', string, unknown, { ch: string }>;

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

describe('useSubscription data ownership', () => {
  it('resets data atomically when variables change and waits for the first event of the new key', () => {
    const { client, subjects } = createMockClient();
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { ch: string }) => useSubscription(mockSubscription as MockSubscriptionWithVars, { ch: props.ch }),
      { ch: 'a' },
      client,
    );

    act(() => subjects.subscription.next(makeResult({ ch: 'a', seq: 1 })));
    expect(result.current.data).toEqual({ ch: 'a', seq: 1 });
    expect(result.current.loading).toBe(false);

    rerender({ ch: 'b' });

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.previousData).toEqual({ ch: 'a', seq: 1 });

    act(() => subjects.subscription.next(makeResult({ ch: 'b', seq: 1 })));
    expect(result.current.data).toEqual({ ch: 'b', seq: 1 });
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ ch: 'a', seq: 1 });
    unmount();
  });

  it('stops loading when skip becomes true mid-flight', () => {
    const { client } = createMockClient();
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { skip: boolean }) =>
        useSubscription(mockSubscription as Artifact<'subscription'>, undefined, { skip: props.skip }),
      { skip: false },
      client,
    );

    expect(result.current.loading).toBe(true);

    rerender({ skip: true });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('keeps data while skipped when the key is unchanged', () => {
    const { client, subjects } = createMockClient();
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { ch: string; skip: boolean }) =>
        useSubscription(mockSubscription as MockSubscriptionWithVars, { ch: props.ch }, { skip: props.skip }),
      { ch: 'a', skip: false },
      client,
    );

    act(() => subjects.subscription.next(makeResult({ ch: 'a', seq: 1 })));
    expect(result.current.data).toEqual({ ch: 'a', seq: 1 });

    rerender({ ch: 'a', skip: true });
    expect(result.current.data).toEqual({ ch: 'a', seq: 1 });
    expect(result.current.loading).toBe(false);

    rerender({ ch: 'b', skip: true });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ ch: 'a', seq: 1 });
    unmount();
  });

  it('does not fire onData on reset, only on real events', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { rerender, unmount } = renderHookWithProps(
      (props: { ch: string }) =>
        useSubscription(mockSubscription as MockSubscriptionWithVars, { ch: props.ch }, { onData }),
      { ch: 'a' },
      client,
    );

    act(() => subjects.subscription.next(makeResult({ ch: 'a', seq: 1 })));
    expect(onData).toHaveBeenCalledTimes(1);

    rerender({ ch: 'b' });
    expect(onData).toHaveBeenCalledTimes(1);

    act(() => subjects.subscription.next(makeResult({ ch: 'b', seq: 1 })));
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith({ ch: 'b', seq: 1 });
    unmount();
  });

  it('fires onError instead of onData when a result carries errors', () => {
    const onData = vitest.fn();
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { unmount } = renderHook(
      () => useSubscription(mockSubscription, undefined, { onData, onError } as MockSubscriptionOptions),
      client,
    );

    act(() => {
      subjects.subscription.next(makeResult({ id: '1' }, { errors: [{ message: 'Boom' }] }));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();
    unmount();
  });
});
