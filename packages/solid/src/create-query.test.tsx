import { describe, it, expect, vi } from 'vitest';
import { batch, createEffect, createSignal } from 'solid-js';
import type { Artifact, Client, OperationResult } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { fromValue } from '@mearie/core/stream';
import { createQuery } from './create-query.ts';
import { createMockClient, renderPrimitive, mockQuery, makeResult } from './test-utils.tsx';

type MockQueryWithVars = Artifact<'query', string, unknown, { id: string }>;
type MockQueryWithIds = Artifact<'query', string, unknown, { ids: string[] }>;
type MockNamedQuery = Artifact<'query', string, { id: string; name: string }, { id: string }>;

const createSyncClient = (resultsByVariables: Record<string, OperationResult>) => {
  const executeQuery = vi.fn((_artifact: unknown, variables: unknown) =>
    fromValue(resultsByVariables[stringify(variables)]!),
  );
  const client = { executeQuery } as unknown as Client;
  return { client, executeQuery };
};

describe('createQuery', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    expect(result.current.error).toBeUndefined();
    dispose();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    expect(result.current.error!.errors[0]!.message).toBe('Not found');
    dispose();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery, undefined, () => ({ skip: true })),
      client,
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    dispose();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery, undefined, () => ({ initialData })),
      client,
    );

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);
    dispose();
  });

  it('should update data after initialData when fetch completes', () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery, undefined, () => ({ initialData })),
      client,
    );

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);

    subjects.query.next(makeResult({ id: '1', name: 'Updated' }));

    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
    expect(result.current.loading).toBe(false);
    dispose();
  });

  it('should re-execute on refetch', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));

    expect(result.current.data).toEqual({ id: '1' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    result.current.refetch();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    dispose();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));

    dispose();

    subjects.query.next(makeResult({ id: '2' }));

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should update data on multiple results', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'First' }));

    expect(result.current.data).toEqual({ id: '1', name: 'First' });

    subjects.query.next(makeResult({ id: '1', name: 'Second' }));

    expect(result.current.data).toEqual({ id: '1', name: 'Second' });
    dispose();
  });

  it('should apply patch-based updates', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));

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

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    dispose();
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});

describe('createQuery data ownership', () => {
  it('resets data atomically when variables change (async source)', () => {
    const { client, subjects } = createMockClient();
    const [id, setId] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery as MockQueryWithVars, () => ({ id: id() })),
      client,
    );

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    setId('b');

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(makeResult({ id: 'b', name: 'second' }));

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });
    dispose();
  });

  it('keeps previousData faithful across a key change with an id-less payload root', () => {
    const { client, subjects } = createMockClient();
    const [id, setId] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery as MockQueryWithVars, () => ({ id: id() })),
      client,
    );

    subjects.query.next(makeResult({ user: { id: 'u1', name: 'first' } }));
    expect(result.current.data).toEqual({ user: { id: 'u1', name: 'first' } });

    setId('b');
    expect(result.current.previousData).toEqual({ user: { id: 'u1', name: 'first' } });

    subjects.query.next(makeResult({ user: { id: 'u2', name: 'second' } }));

    expect(result.current.data).toEqual({ user: { id: 'u2', name: 'second' } });
    expect(result.current.previousData).toEqual({ user: { id: 'u1', name: 'first' } });
    dispose();
  });

  it('carries non-plain scalar values into previousData by reference', () => {
    const { client, subjects } = createMockClient();
    const stamp = new Date('2020-01-01T00:00:00.000Z');
    const [id, setId] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery as MockQueryWithVars, () => ({ id: id() })),
      client,
    );

    subjects.query.next(makeResult({ user: { id: 'u1', createdAt: stamp } }));

    setId('b');
    subjects.query.next(makeResult({ user: { id: 'u2', createdAt: new Date('2021-01-01T00:00:00.000Z') } }));

    expect((result.current.previousData as { user: { createdAt: Date } }).user.createdAt).toBe(stamp);
    dispose();
  });

  it('shows new data with no loading frame on a synchronous source', () => {
    const executeQuery = vi.fn((_artifact: unknown, variables: unknown) =>
      fromValue(makeResult({ echo: stringify(variables) })),
    );
    const client = { executeQuery } as unknown as Client;
    const [id, setId] = createSignal('a');
    const { result, dispose } = renderPrimitive(
      () => createQuery(mockQuery as MockQueryWithVars, () => ({ id: id() })),
      client,
    );

    expect(result.current.data).toEqual({ echo: stringify({ id: 'a' }) });
    expect(result.current.loading).toBe(false);

    setId('b');

    expect(result.current.data).toEqual({ echo: stringify({ id: 'b' }) });
    expect(result.current.loading).toBe(false);
    dispose();
  });

  it('keeps data while skipped with unchanged variables, resets when variables changed under skip', () => {
    const { client, subjects } = createMockClient();
    const [id, setId] = createSignal('a');
    const [skip, setSkip] = createSignal(false);
    const { result, dispose } = renderPrimitive(
      () =>
        createQuery(
          mockQuery as MockQueryWithVars,
          () => ({ id: id() }),
          () => ({ skip: skip() }),
        ),
      client,
    );

    subjects.query.next(makeResult({ id: 'a' }));
    expect(result.current.data).toEqual({ id: 'a' });

    setSkip(true);
    expect(result.current.data).toEqual({ id: 'a' });
    expect(result.current.loading).toBe(false);

    setId('b');

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ id: 'a' });
    dispose();
  });

  it('attributes fresh initialData to the new key on variable change', () => {
    const { client } = createMockClient();
    const [id, setId] = createSignal('a');
    const [seed, setSeed] = createSignal({ id: 'a', name: 'first' });
    const { result, dispose } = renderPrimitive(
      () =>
        createQuery(
          mockQuery as MockNamedQuery,
          () => ({ id: id() }),
          () => ({ initialData: seed() }),
        ),
      client,
    );

    expect(result.current.data).toEqual({ id: 'a', name: 'first' });
    expect(result.current.loading).toBe(false);

    batch(() => {
      setSeed({ id: 'b', name: 'second' });
      setId('b');
    });

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('attributes fresh initialData to the new key while skipped', () => {
    const { client } = createMockClient();
    const [id, setId] = createSignal('a');
    const [seed, setSeed] = createSignal({ id: 'a', name: 'first' });
    const { result, dispose } = renderPrimitive(
      () =>
        createQuery(
          mockQuery as MockNamedQuery,
          () => ({ id: id() }),
          () => ({ initialData: seed(), skip: true }),
        ),
      client,
    );

    expect(result.current.data).toEqual({ id: 'a', name: 'first' });
    expect(result.current.loading).toBe(false);

    batch(() => {
      setSeed({ id: 'b', name: 'second' });
      setId('b');
    });

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.loading).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    dispose();
  });

  it('warns when the same initialData reference is reused across keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = createMockClient();
    const shared = { id: 'a', name: 'first' };
    const [id, setId] = createSignal('a');
    const { dispose } = renderPrimitive(
      () =>
        createQuery(
          mockQuery as MockNamedQuery,
          () => ({ id: id() }),
          () => ({ initialData: shared }),
        ),
      client,
    );

    setId('b');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[mearie]');
    expect(warn.mock.calls[0]?.[0]).toContain('initialData');
    warn.mockRestore();
    dispose();
  });
});

describe('createQuery modal reopen regression', () => {
  it('never shows the previous key data when reactivated with a different warmed key', () => {
    const { client } = createSyncClient({
      [stringify({ ids: ['a'] })]: makeResult({ items: [{ id: 'a', secret: 'alpha' }] }),
      [stringify({ ids: ['b'] })]: makeResult({ items: [{ id: 'b', secret: null }] }),
    });

    const [ids, setIds] = createSignal<string[]>(['a']);
    const seen: string[] = [];
    const { result, dispose } = renderPrimitive(() => {
      const query = createQuery(
        mockQuery as MockQueryWithIds,
        () => ({ ids: ids() }),
        () => ({ skip: ids().length === 0 }),
      );

      createEffect(() => {
        seen.push(JSON.stringify(query.data ?? null));
      });

      return query;
    }, client);

    expect(result.current.data).toEqual({ items: [{ id: 'a', secret: 'alpha' }] });

    // close: skip + variables reset in one change
    setIds([]);
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);

    // reopen with a different key
    const before = seen.length;
    setIds(['b']);

    expect(result.current.data).toEqual({ items: [{ id: 'b', secret: null }] });
    expect(result.current.loading).toBe(false);
    expect(seen.slice(before).some((snapshot) => snapshot.includes('alpha'))).toBe(false);
    dispose();
  });
});

describe('createQuery fine-grained reactivity', () => {
  it('preserves data reference identity through a patch', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));

    const before = result.current.data;
    expect(before).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );

    expect(result.current.data).toBe(before);
    expect(result.current.data).toEqual({ id: 'a', name: 'second' });
    dispose();
  });

  it('serves the new root when a root-level set patch replaces the payload', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: [], value: { id: 'b', name: 'second' } }] } },
      }),
    );

    expect(result.current.data).toEqual({ id: 'b', name: 'second' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'third' }] } },
      }),
    );

    expect(result.current.data).toEqual({ id: 'b', name: 'third' });
    dispose();
  });

  it('re-runs only the effects that read the changed field, and no data reader on refetch', () => {
    const { client, subjects } = createMockClient();
    let nameRuns = 0;
    let otherRuns = 0;
    let seenName: unknown;

    const { result, dispose } = renderPrimitive(() => {
      const query = createQuery(mockQuery);

      createEffect(() => {
        seenName = (query.data as { name?: string } | undefined)?.name;
        nameRuns += 1;
      });

      createEffect(() => {
        void (query.data as { other?: string } | undefined)?.other;
        otherRuns += 1;
      });

      return query;
    }, client);

    subjects.query.next(makeResult({ id: 'a', name: 'first', other: 'x' }));

    expect(result.current.data).toEqual({ id: 'a', name: 'first', other: 'x' });
    const baseNameRuns = nameRuns;
    const baseOtherRuns = otherRuns;

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'y' }] } },
      }),
    );

    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(nameRuns).toBe(baseNameRuns);

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );

    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(seenName).toBe('second');
    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(result.current.data).toEqual({ id: 'a', name: 'second', other: 'y' });

    result.current.refetch();

    expect(result.current.loading).toBe(true);
    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(otherRuns).toBe(baseOtherRuns + 1);
    dispose();
  });
});
