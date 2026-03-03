import { describe, it, expect, vi as vitest } from 'vitest';
import { AggregatedError } from '@mearie/core';
import { createSubscription } from './create-subscription.ts';
import { createMockClient, renderHook, mockSubscription, makeResult } from './test-utils.tsx';

describe('createSubscription', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createSubscription(mockSubscription), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    subjects.subscription.next(makeResult({ id: '1' }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1' });
    dispose();
  });

  it('should handle multiple emissions', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult({ count: 1 }));
    expect(result.current.data).toEqual({ count: 1 });

    subjects.subscription.next(makeResult({ count: 2 }));
    expect(result.current.data).toEqual({ count: 2 });

    subjects.subscription.next(makeResult({ count: 3 }));
    expect(result.current.data).toEqual({ count: 3 });
    dispose();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Sub failed' }] }));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    dispose();
  });

  it('should call onData callback', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { dispose } = renderHook(() => createSubscription(mockSubscription, undefined, () => ({ onData })), client);

    subjects.subscription.next(makeResult({ id: '1' }));

    expect(onData).toHaveBeenCalledWith({ id: '1' });
    dispose();
  });

  it('should call onError callback', () => {
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { dispose } = renderHook(() => createSubscription(mockSubscription, undefined, () => ({ onError })), client);

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Error' }] }));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AggregatedError));
    dispose();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderHook(
      () => createSubscription(mockSubscription, undefined, () => ({ skip: true })),
      client,
    );

    expect(result.current.loading).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeSubscription).not.toHaveBeenCalled();
    dispose();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult({ id: '1' }));

    dispose();

    subjects.subscription.next(makeResult({ id: '2' }));

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createSubscription(mockSubscription), client);

    const testMetadata = { source: 'ws' };
    subjects.subscription.next(makeResult({ id: '1' }, { metadata: testMetadata }));

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});
