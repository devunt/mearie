import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Artifact, Client, OperationResult, FragmentRefs } from '@mearie/core';
import type { Sink, Subscription as StreamSubscription } from '@mearie/core/stream';
import { makeSubject, fromValue } from '@mearie/core/stream';
import { createFragment } from './create-fragment.svelte.ts';
import { createMockClient, mockFragment, makeResult } from './test-utils.svelte.ts';
import TestRunner from './TestRunner.svelte';
import type { Fragment } from './create-fragment.svelte.ts';

const FragmentRefKey = '__fragmentRef' as const;
const FragmentVarsKey = '__fragmentVars' as const;

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
  setupFn: () => unknown,
): { result: { current: Fragment<Artifact<'fragment'>> }; destroy: () => void } => {
  const result = { current: undefined as unknown as Fragment<Artifact<'fragment'>> };
  const target = document.createElement('div');

  const component = mount(TestRunner, {
    target,
    props: {
      client,
      setupFn,
      onResult: (r: unknown) => {
        result.current = r as Fragment<Artifact<'fragment'>>;
      },
    },
  });

  flushSync();
  return { result, destroy: () => void unmount(component) };
};

describe('render harness', () => {
  it('re-runs an effect created inside the render setup closure when read state changes', () => {
    const { client } = createMockClient();
    const box = $state({ value: 0 });
    let runs = 0;

    const { destroy } = renderFragment(client, () => {
      $effect(() => {
        void box.value;
        runs += 1;
      });
      return { data: null, metadata: undefined };
    });

    expect(runs).toBe(1);

    box.value = 1;
    flushSync();

    expect(runs).toBe(2);
    destroy();
  });
});

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

  it('should throw when fragment data is not found', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const initialResult = makeResult(undefined);
    const { client } = createSyncFragmentClient(initialResult);

    expect(() => {
      renderFragment(client, () =>
        createFragment(mockFragment as Artifact<'fragment'>, () => createFragmentRef() as FragmentRefs<string>),
      );
    }).toThrow('Fragment data not found');
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

const createIdentityRef = (storageKey: string) => ({ [FragmentRefKey]: storageKey });

const readStorageKey = (ref: unknown) => (ref as Record<string, unknown>)[FragmentRefKey] as string;

const mockByIdentity = (client: Client) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) => {
    const storageKey = readStorageKey(ref);
    return fromValue(makeResult({ id: storageKey, name: storageKey === 'Entity:a' ? 'first' : 'second' }));
  });
};

describe('createFragment ref transitions', () => {
  it('serves the new ref data synchronously in the same flush, never the old ref data', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const box = $state({ ref: createIdentityRef('Entity:a') });
    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never),
    );

    expect(result.current.data).toEqual({ id: 'Entity:a', name: 'first' });

    box.ref = createIdentityRef('Entity:b');
    flushSync();

    expect(result.current.data).toEqual({ id: 'Entity:b', name: 'second' });
    destroy();
  });

  it('never lets a reader that runs before the hook observe the new ref with the old ref data', () => {
    const { client } = createMockClient();
    mockByIdentity(client);

    const box = $state({ ref: createIdentityRef('Entity:a') });
    const observed: { id: string; name: string }[] = [];
    let fragment: { data: unknown } | undefined;

    const { destroy } = renderFragment(client, () => {
      $effect.pre(() => {
        const id = readStorageKey(box.ref);
        observed.push({ id, name: fragment ? (fragment.data as { name: string }).name : 'none' });
      });

      fragment = createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never) as { data: unknown };
      return fragment;
    });

    box.ref = createIdentityRef('Entity:b');
    flushSync();

    expect(observed).not.toContainEqual({ id: 'Entity:b', name: 'first' });
    expect(observed).toContainEqual({ id: 'Entity:b', name: 'second' });
    destroy();
  });

  it('throws when a ref transition finds no data in the cache', () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) =>
      readStorageKey(ref) === 'Entity:a'
        ? fromValue(makeResult({ id: 'Entity:a', name: 'first' }))
        : // eslint-disable-next-line unicorn/no-useless-undefined
          fromValue(makeResult(undefined)),
    );

    const box = $state({ ref: createIdentityRef('Entity:a') });

    renderFragment(client, () => {
      const fragment = createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never);

      $effect.pre(() => {
        void (fragment.data as unknown as { name: string }).name;
      });

      return fragment;
    });

    expect(() => {
      box.ref = createIdentityRef('Entity:b');
      flushSync();
    }).toThrow('Fragment data not found');
  });

  it('keeps accepting emissions after an unrelated parent field is patched in place', () => {
    const { client, subjects } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment)
      .mockImplementationOnce(() => fromValue(makeResult({ id: '1', name: 'first' })))
      .mockImplementation(() => subjects.fragment.source);

    const parentNode = $state({ [FragmentRefKey]: 'Entity:a', title: 'before' });
    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => parentNode as never),
    );

    expect(result.current.data).toEqual({ id: '1', name: 'first' });

    parentNode.title = 'after';
    flushSync();

    // the parent patch must not be tracked: no key change, so no re-read and no resubscription
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'second' });
    destroy();
  });

  it('resubscribes when only the fragment arguments change', () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) => {
      const vars = (ref as Record<string, Record<string, { limit: number }> | undefined>)[FragmentVarsKey]?.[
        mockFragment.name
      ];
      return fromValue(makeResult({ id: 'Entity:a', limit: vars?.limit ?? 0 }));
    });

    const box = $state({
      ref: { [FragmentRefKey]: 'Entity:a', [FragmentVarsKey]: { [mockFragment.name]: { limit: 10 } } },
    });

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never),
    );

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 10 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    // a re-projection replaces the fragment's vars entry with a new object (see cache/denormalize.ts)
    box.ref[FragmentVarsKey] = { [mockFragment.name]: { limit: 20 } };
    flushSync();

    expect(result.current.data).toEqual({ id: 'Entity:a', limit: 20 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(3);
    destroy();
  });

  it('re-keys a keyless ref when its content is mutated in place', () => {
    const { client } = createMockClient();
    // faithful echo branch: keyless refs get a one-shot result carrying the ref itself, with no cache listener
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation((_fragment: unknown, ref: unknown) =>
      fromValue(makeResult(ref)),
    );

    const box = $state({ ref: { title: 'before' } });

    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never),
    );

    expect(result.current.data).toEqual({ title: 'before' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(2);

    box.ref.title = 'after';
    flushSync();

    expect(result.current.data).toEqual({ title: 'after' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeFragment).toHaveBeenCalledTimes(3);
    destroy();
  });

  it('clears to null atomically for optional fragments', () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment).mockImplementation(() => fromValue(makeResult({ id: 'a' })));

    const box = $state<{ ref: { id: string } | null }>({ ref: { id: 'a' } });
    const { result, destroy } = renderFragment(client, () =>
      createFragment(mockFragment as Artifact<'fragment'>, () => box.ref as never),
    );

    expect(result.current.data).toEqual({ id: 'a' });

    box.ref = null;
    flushSync();
    expect(result.current.data).toBeNull();
    destroy();
  });
});

describe('createFragment fine-grained reactivity', () => {
  it('re-runs only the effects that read the patched field', () => {
    const { client, subjects } = createMockClient();
    const initialResult = makeResult({ id: '1', name: 'first', other: 'one' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeFragment)
      .mockImplementationOnce(() => fromValue(initialResult))
      .mockImplementation(() => subjects.fragment.source);

    const ref = createFragmentRef();
    let nameRuns = 0;
    let otherRuns = 0;
    let observedName: unknown;

    const { destroy } = renderFragment(client, () => {
      const fragment = createFragment(mockFragment as Artifact<'fragment'>, () => ref as FragmentRefs<string>);

      $effect(() => {
        observedName = (fragment.data as { name: string }).name;
        nameRuns += 1;
      });

      $effect(() => {
        void (fragment.data as { other: string }).other;
        otherRuns += 1;
      });

      return fragment;
    });

    expect(nameRuns).toBe(1);
    expect(otherRuns).toBe(1);
    expect(observedName).toBe('first');

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'two' }] } },
      }),
    );
    flushSync();

    expect(otherRuns).toBe(2);
    expect(nameRuns).toBe(1);
    expect(observedName).toBe('first');

    subjects.fragment.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    flushSync();

    expect(nameRuns).toBe(2);
    expect(observedName).toBe('second');
    expect(otherRuns).toBe(2);
    destroy();
  });
});
