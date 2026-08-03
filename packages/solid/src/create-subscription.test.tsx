import { describe, it, expect, vi as vitest } from 'vitest';
import { createSignal } from 'solid-js';
import type { Artifact } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { createSubscription } from './create-subscription.ts';
import { createMockClient, renderPrimitive, mockSubscription, makeResult } from './test-utils.tsx';

type MockSubscriptionWithVars = Artifact<'subscription', string, unknown, { ch: string }>;

describe('createSubscription', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createSubscription(mockSubscription), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    subjects.subscription.next(makeResult({ id: '1' }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1' });
    dispose();
  });

  it('should handle multiple emissions', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createSubscription(mockSubscription), client);

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
    const { result, dispose } = renderPrimitive(() => createSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Sub failed' }] }));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    dispose();
  });

  it('should call onData callback', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { dispose } = renderPrimitive(
      () => createSubscription(mockSubscription, undefined, () => ({ onData })),
      client,
    );

    subjects.subscription.next(makeResult({ id: '1' }));

    expect(onData).toHaveBeenCalledWith({ id: '1' });
    dispose();
  });

  it('should call onError callback', () => {
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { dispose } = renderPrimitive(
      () => createSubscription(mockSubscription, undefined, () => ({ onError })),
      client,
    );

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Error' }] }));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AggregatedError));
    dispose();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderPrimitive(
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
    const { result, dispose } = renderPrimitive(() => createSubscription(mockSubscription), client);

    subjects.subscription.next(makeResult({ id: '1' }));

    dispose();

    subjects.subscription.next(makeResult({ id: '2' }));

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createSubscription(mockSubscription), client);

    const testMetadata = { source: 'ws' };
    subjects.subscription.next(makeResult({ id: '1' }, { metadata: testMetadata }));

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});

describe('createSubscription data ownership', () => {
  it('resets data atomically when variables change and waits for the first event of the new key', () => {
    const { client, subjects } = createMockClient();
    const [ch, setCh] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createSubscription(mockSubscription as MockSubscriptionWithVars, () => ({ ch: ch() })),
      client,
    );

    subjects.subscription.next(makeResult({ ch: 'a', seq: 1 }));
    expect(result.current.data).toEqual({ ch: 'a', seq: 1 });
    expect(result.current.loading).toBe(false);

    setCh('b');

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.previousData).toEqual({ ch: 'a', seq: 1 });

    subjects.subscription.next(makeResult({ ch: 'b', seq: 1 }));

    expect(result.current.data).toEqual({ ch: 'b', seq: 1 });
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ ch: 'a', seq: 1 });
    dispose();
  });

  it('stops loading when skip becomes true mid-flight', () => {
    const { client } = createMockClient();
    const [skip, setSkip] = createSignal(false);
    const { result, dispose } = renderPrimitive(
      () => createSubscription(mockSubscription, undefined, () => ({ skip: skip() })),
      client,
    );

    expect(result.current.loading).toBe(true);

    setSkip(true);

    expect(result.current.loading).toBe(false);
    dispose();
  });

  it('does not fire onData on reset, only on real events', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const [ch, setCh] = createSignal('a');
    const { dispose } = renderPrimitive(
      () =>
        createSubscription(
          mockSubscription as MockSubscriptionWithVars,
          () => ({ ch: ch() }),
          () => ({ onData }),
        ),
      client,
    );

    subjects.subscription.next(makeResult({ ch: 'a', seq: 1 }));
    expect(onData).toHaveBeenCalledTimes(1);

    setCh('b');
    expect(onData).toHaveBeenCalledTimes(1);

    subjects.subscription.next(makeResult({ ch: 'b', seq: 1 }));

    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith({ ch: 'b', seq: 1 });
    dispose();
  });

  it('fires onError instead of onData when a result carries errors', () => {
    const onData = vitest.fn();
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(
      () => createSubscription(mockSubscription, undefined, () => ({ onData, onError })),
      client,
    );

    subjects.subscription.next(makeResult({ id: '1' }, { errors: [{ message: 'Boom' }] }));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    dispose();
  });

  it('keeps previousData faithful across a key change with an id-less payload root', () => {
    const { client, subjects } = createMockClient();
    const [ch, setCh] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createSubscription(mockSubscription as MockSubscriptionWithVars, () => ({ ch: ch() })),
      client,
    );

    subjects.subscription.next(makeResult({ event: { id: 'e1', body: 'first' } }));
    expect(result.current.data).toEqual({ event: { id: 'e1', body: 'first' } });

    setCh('b');
    expect(result.current.previousData).toEqual({ event: { id: 'e1', body: 'first' } });

    subjects.subscription.next(makeResult({ event: { id: 'e2', body: 'second' } }));

    expect(result.current.data).toEqual({ event: { id: 'e2', body: 'second' } });
    expect(result.current.previousData).toEqual({ event: { id: 'e1', body: 'first' } });
    dispose();
  });
});
