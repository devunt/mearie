import { describe, it, expect, vi as vitest } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Artifact, Client } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { createSubscription } from './create-subscription.svelte.ts';
import { createMockClient, mockSubscription, makeResult } from './test-utils.svelte.ts';
import HookRunner from './HookRunner.svelte';
import type { Subscription, CreateSubscriptionOptions } from './create-subscription.svelte.ts';

const renderSubscription = (
  client: Client,
  hookFn: () => unknown,
): { result: { current: Subscription<Artifact<'subscription'>> }; destroy: () => void } => {
  const result = { current: undefined as unknown as Subscription<Artifact<'subscription'>> };
  const target = document.createElement('div');

  const component = mount(HookRunner, {
    target,
    props: {
      client,
      hookFn,
      onResult: (r: unknown) => {
        result.current = r as Subscription<Artifact<'subscription'>>;
      },
    },
  });

  flushSync();
  return { result, destroy: () => void unmount(component) };
};

describe('createSubscription', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(mockSubscription as Artifact<'subscription'>),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    subjects.subscription.next(makeResult({ id: '1' }));
    flushSync();

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1' });
    destroy();
  });

  it('should handle multiple emissions', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(mockSubscription as Artifact<'subscription'>),
    );

    subjects.subscription.next(makeResult({ count: 1 }));
    flushSync();

    expect(result.current.data).toEqual({ count: 1 });

    subjects.subscription.next(makeResult({ count: 2 }));
    flushSync();

    expect(result.current.data).toEqual({ count: 2 });

    subjects.subscription.next(makeResult({ count: 3 }));
    flushSync();

    expect(result.current.data).toEqual({ count: 3 });
    destroy();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(mockSubscription as Artifact<'subscription'>),
    );

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Sub failed' }] }));
    flushSync();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    destroy();
  });

  it('should call onData callback', () => {
    const onData = vitest.fn();
    const { client, subjects } = createMockClient();
    const { destroy } = renderSubscription(client, () =>
      createSubscription(
        mockSubscription as Artifact<'subscription'>,
        undefined,
        () => ({ onData }) as CreateSubscriptionOptions<Artifact<'subscription'>>,
      ),
    );

    subjects.subscription.next(makeResult({ id: '1' }));
    flushSync();

    expect(onData).toHaveBeenCalledWith({ id: '1' });
    destroy();
  });

  it('should call onError callback', () => {
    const onError = vitest.fn();
    const { client, subjects } = createMockClient();
    const { destroy } = renderSubscription(client, () =>
      createSubscription(
        mockSubscription as Artifact<'subscription'>,
        undefined,
        () => ({ onError }) as CreateSubscriptionOptions<Artifact<'subscription'>>,
      ),
    );

    subjects.subscription.next(makeResult(undefined, { errors: [{ message: 'Error' }] }));
    flushSync();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AggregatedError));
    destroy();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(
        mockSubscription as Artifact<'subscription'>,
        undefined,
        () => ({ skip: true }) as CreateSubscriptionOptions<Artifact<'subscription'>>,
      ),
    );

    expect(result.current.loading).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeSubscription).not.toHaveBeenCalled();
    destroy();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(mockSubscription as Artifact<'subscription'>),
    );

    subjects.subscription.next(makeResult({ id: '1' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1' });

    destroy();

    subjects.subscription.next(makeResult({ id: '2' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderSubscription(client, () =>
      createSubscription(mockSubscription as Artifact<'subscription'>),
    );

    const testMetadata = { source: 'ws' };
    subjects.subscription.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    flushSync();

    expect(result.current.metadata).toEqual(testMetadata);
    destroy();
  });
});
