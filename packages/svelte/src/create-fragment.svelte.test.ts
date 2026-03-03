import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Artifact, Client, OperationResult, FragmentRefs } from '@mearie/core';
import type { Sink, Subscription as StreamSubscription } from '@mearie/core/stream';
import { makeSubject } from '@mearie/core/stream';
import { createFragment } from './create-fragment.svelte.ts';
import { createMockClient, mockFragment, makeResult } from './test-utils.svelte.ts';
import HookRunner from './HookRunner.svelte';
import type { Fragment } from './create-fragment.svelte.ts';

const createFragmentRef = (name = 'TestFragment') => ({
  ' $fragmentRefs': { [name]: true as const },
});

const createSyncFragmentClient = (initialResult: OperationResult) => {
  const { client } = createMockClient();
  const subject = makeSubject<OperationResult>();

  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(client.executeFragment).mockImplementation(() => (sink: Sink<OperationResult>): StreamSubscription => {
    sink.next(initialResult);
    return subject.source(sink);
  });

  return { client, subject };
};

const renderFragment = (
  client: Client,
  hookFn: () => unknown,
): { result: { current: Fragment<Artifact<'fragment'>> }; destroy: () => void } => {
  const result = { current: undefined as unknown as Fragment<Artifact<'fragment'>> };
  const target = document.createElement('div');

  const component = mount(HookRunner, {
    target,
    props: {
      client,
      hookFn,
      onResult: (r: unknown) => {
        result.current = r as Fragment<Artifact<'fragment'>>;
      },
    },
  });

  flushSync();
  return { result, destroy: () => void unmount(component) };
};

describe('createFragment', () => {
  it('should read a single fragment ref', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => ref as FragmentRefs<string>),
    );

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    destroy();
  });

  it('should read an array of fragment refs', () => {
    const refs = [createFragmentRef(), createFragmentRef()];
    const initialResult = makeResult([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    const { client } = createSyncFragmentClient(initialResult);

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => refs as FragmentRefs<string>[]),
    );

    expect(result.current.data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    destroy();
  });

  it('should return null for null/undefined ref', () => {
    const { client } = createMockClient();

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => null),
    );

    expect(result.current.data).toBeNull();
    destroy();
  });

  it('should update on patch-based changes', () => {
    const initialResult = makeResult({ id: '1', name: 'Alice' });
    const { client, subject } = createSyncFragmentClient(initialResult);
    const ref = createFragmentRef();

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => ref as FragmentRefs<string>),
    );

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
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    destroy();
  });

  it('should provide synchronous initial data via peek', () => {
    const ref = createFragmentRef();
    const initialResult = makeResult({ id: '1', name: 'Sync' });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => ref as FragmentRefs<string>),
    );

    expect(result.current.data).toEqual({ id: '1', name: 'Sync' });
    destroy();
  });

  it('should expose metadata', () => {
    const ref = createFragmentRef();
    const testMetadata = { cache: { stale: true } };
    const initialResult = makeResult({ id: '1' }, { metadata: testMetadata });
    const { client } = createSyncFragmentClient(initialResult);

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => ref as FragmentRefs<string>),
    );

    expect(result.current.metadata).toEqual(testMetadata);
    destroy();
  });
});
