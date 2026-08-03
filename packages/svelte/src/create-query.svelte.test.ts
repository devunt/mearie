import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Artifact, Client } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { createQuery } from './create-query.svelte.ts';
import { createMockClient, createSyncMockClient, mockQuery, makeResult } from './test-utils.svelte.ts';
import TestRunner from './TestRunner.svelte';
import type { Query } from './create-query.svelte.ts';

type MockQueryWithVars = Artifact<'query', string, unknown, { id: string }>;
type MockQueryWithIds = Artifact<'query', string, unknown, { ids: string[] }>;

const renderQuery = (
  client: Client,
  setupFn: () => unknown,
): { result: { current: Query<Artifact<'query'>> }; destroy: () => void } => {
  const result = { current: undefined as unknown as Query<Artifact<'query'>> };
  const target = document.createElement('div');

  const component = mount(TestRunner, {
    target,
    props: {
      client,
      setupFn,
      onResult: (r: unknown) => {
        result.current = r as Query<Artifact<'query'>>;
      },
    },
  });

  flushSync();
  return { result, destroy: () => void unmount(component) };
};

describe('createQuery', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    flushSync();

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    expect(result.current.error).toBeUndefined();
    destroy();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
    flushSync();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    expect(result.current.error!.errors[0]!.message).toBe('Not found');
    destroy();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, destroy } = renderQuery(client, () =>
      createQuery(mockQuery as Artifact<'query'>, undefined, () => ({ skip: true })),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    destroy();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, destroy } = renderQuery(client, () =>
      createQuery(mockQuery as Artifact<'query'>, undefined, () => ({ initialData })),
    );

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);
    destroy();
  });

  it('should pass fetchPolicy to executeQuery', () => {
    const { client } = createMockClient();
    const { destroy } = renderQuery(client, () =>
      createQuery(mockQuery as Artifact<'query'>, undefined, () => ({ fetchPolicy: 'network-only' })),
    );

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledWith(mockQuery, undefined, { fetchPolicy: 'network-only' });
    destroy();
  });

  it('should update data after initialData when fetch completes', () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, destroy } = renderQuery(client, () =>
      createQuery(mockQuery as Artifact<'query'>, undefined, () => ({ initialData })),
    );

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);

    subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
    expect(result.current.loading).toBe(false);
    destroy();
  });

  it('should re-execute on refetch', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult({ id: '1' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    result.current.refetch();
    flushSync();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    destroy();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult({ id: '1' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1' });

    destroy();

    subjects.query.next(makeResult({ id: '2' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should update data on multiple results', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult({ id: '1', name: 'First' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'First' });

    subjects.query.next(makeResult({ id: '1', name: 'Second' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'Second' });
    destroy();
  });

  it('should apply patch-based updates', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    flushSync();

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });

    subjects.query.next(
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

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    const testMetadata = { cache: { stale: true } };
    subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    flushSync();

    expect(result.current.metadata).toEqual(testMetadata);
    destroy();
  });
});

describe('createQuery data ownership', () => {
  it('resets data atomically when variables change (async source)', () => {
    const { client, subjects } = createMockClient();
    const vars = $state({ id: 'a' });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(mockQuery as MockQueryWithVars, () => ({ id: vars.id })),
    );

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    flushSync();
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    vars.id = 'b';
    flushSync();

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(makeResult({ id: 'b', name: 'second' }));
    flushSync();
    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });
    destroy();
  });

  it('shows new data in the same flush on a synchronous cache hit, with no loading frame', () => {
    const { client } = createSyncMockClient({
      [stringify({ id: 'a' })]: makeResult({ id: 'a', name: 'first' }),
      [stringify({ id: 'b' })]: makeResult({ id: 'b', name: 'second' }),
    });
    const vars = $state({ id: 'a' });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(mockQuery as MockQueryWithVars, () => ({ id: vars.id })),
    );

    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    vars.id = 'b';
    flushSync();

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.loading).toBe(false);
    destroy();
  });

  it('keeps data while skipped with unchanged variables, resets when variables changed under skip', () => {
    const { client, subjects } = createMockClient();
    const controls = $state({ id: 'a', skip: false });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(
        mockQuery as MockQueryWithVars,
        () => ({ id: controls.id }),
        () => ({ skip: controls.skip }),
      ),
    );

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    flushSync();
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    controls.skip = true;
    flushSync();
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });
    expect(result.current.loading).toBe(false);

    controls.id = 'b';
    flushSync();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });
    destroy();
  });

  it('attributes fresh initialData to the new key on variable change', () => {
    const { client } = createMockClient();
    const box = $state({ id: 'a', initialData: { id: 'a', name: 'first' } });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(
        mockQuery as MockQueryWithVars,
        () => ({ id: box.id }),
        () => ({ initialData: box.initialData }),
      ),
    );

    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    box.initialData = { id: 'b', name: 'second' };
    box.id = 'b';
    flushSync();

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.loading).toBe(false);
    destroy();
  });

  it('attributes fresh initialData to the new key while skipped', () => {
    const { client } = createMockClient();
    const box = $state({ id: 'a', initialData: { id: 'a', name: 'first' } });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(
        mockQuery as MockQueryWithVars,
        () => ({ id: box.id }),
        () => ({ initialData: box.initialData, skip: true }),
      ),
    );

    expect(result.current.data).toEqual({ id: 'a', name: 'first' });
    expect(result.current.loading).toBe(false);

    box.initialData = { id: 'b', name: 'second' };
    box.id = 'b';
    flushSync();

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.loading).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    destroy();
  });

  it('warns when the same initialData reference is reused across keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = createMockClient();
    const shared = { id: 'a', name: 'first' };
    const box = $state({ id: 'a' });
    const { destroy } = renderQuery(client, () =>
      createQuery(
        mockQuery as MockQueryWithVars,
        () => ({ id: box.id }),
        () => ({ initialData: shared }),
      ),
    );

    box.id = 'b';
    flushSync();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[mearie]');
    expect(warn.mock.calls[0]?.[0]).toContain('initialData');
    warn.mockRestore();
    destroy();
  });
});

describe('createQuery modal reopen regression', () => {
  it('never shows the previous key data when reactivated with a different warmed key', () => {
    const { client } = createSyncMockClient({
      [stringify({ ids: ['a'] })]: makeResult({ items: [{ id: 'a', secret: 'alpha' }] }),
      [stringify({ ids: ['b'] })]: makeResult({ items: [{ id: 'b', secret: null }] }),
    });

    const controls = $state({ ids: ['a'] as string[] });
    const { result, destroy } = renderQuery(client, () =>
      createQuery(
        mockQuery as MockQueryWithIds,
        () => ({ ids: controls.ids }),
        () => ({ skip: controls.ids.length === 0 }),
      ),
    );

    expect(result.current.data).toEqual({ items: [{ id: 'a', secret: 'alpha' }] });

    // close: skip + variables reset in one change
    controls.ids = [];
    flushSync();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);

    // reopen with a different key
    controls.ids = ['b'];
    flushSync();

    expect(result.current.data).toEqual({ items: [{ id: 'b', secret: null }] });
    expect(result.current.loading).toBe(false);
    destroy();
  });
});

describe('createQuery fine-grained reactivity', () => {
  it('preserves data reference identity through a patch', () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderQuery(client, () => createQuery(mockQuery as Artifact<'query'>));

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    flushSync();

    const before = result.current.data;
    expect(before).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: {
          cache: {
            patches: [{ type: 'set', path: ['name'], value: 'second' }],
          },
        },
      }),
    );
    flushSync();

    expect(result.current.data).toBe(before);
    expect(result.current.data).toEqual({ id: 'a', name: 'second' });
    destroy();
  });

  it('re-runs only the effects that read the changed field, and no data reader on refetch', () => {
    const { client, subjects } = createMockClient();
    let nameRuns = 0;
    let otherRuns = 0;

    const { result, destroy } = renderQuery(client, () => {
      const query = createQuery(mockQuery as Artifact<'query'>);

      $effect(() => {
        void (query.data as { name: string } | undefined)?.name;
        nameRuns += 1;
      });

      $effect(() => {
        void (query.data as { other: string } | undefined)?.other;
        otherRuns += 1;
      });

      return query;
    });

    subjects.query.next(makeResult({ id: 'a', name: 'first', other: 'x' }));
    flushSync();

    expect(result.current.data).toEqual({ id: 'a', name: 'first', other: 'x' });
    const baseNameRuns = nameRuns;
    const baseOtherRuns = otherRuns;

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'y' }] } },
      }),
    );
    flushSync();

    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(nameRuns).toBe(baseNameRuns);

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    flushSync();

    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(result.current.data).toEqual({ id: 'a', name: 'second', other: 'y' });
    expect(otherRuns).toBe(baseOtherRuns + 1);

    result.current.refetch();
    flushSync();

    expect(result.current.loading).toBe(true);
    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(otherRuns).toBe(baseOtherRuns + 1);
    destroy();
  });
});
