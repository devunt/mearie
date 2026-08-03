import { describe, it, expect, vi } from 'vitest';
import { nextTick, ref, watchEffect } from 'vue';
import type { Artifact, Client, OperationResult } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { fromValue } from '@mearie/core/stream';
import { useQuery } from './use-query.ts';
import { createMockClient, withSetup, mockQuery, makeResult } from './test-utils.ts';

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

describe('useQuery', () => {
  it('should transition from loading to data', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBeUndefined();

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toEqual({ id: '1', name: 'Alice' });
    expect(result.error.value).toBeUndefined();
    unmount();
  });

  it('should handle errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
    await nextTick();

    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeInstanceOf(AggregatedError);
    expect(result.error.value!.errors[0]!.message).toBe('Not found');
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { skip: true }), client);

    expect(result.loading.value).toBe(false);
    expect(result.data.value).toBeUndefined();
    expect(client.executeQuery).not.toHaveBeenCalled();
    unmount();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.data.value).toEqual(initialData);
    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('should update data after initialData when fetch completes', async () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = withSetup(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.data.value).toEqual(initialData);
    expect(result.loading.value).toBe(false);

    subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Updated' });
    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('should re-execute on refetch', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    result.refetch();
    await nextTick();

    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.loading.value).toBe(true);
    unmount();
  });

  it('should unsubscribe on unmount', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });

    unmount();

    subjects.query.next(makeResult({ id: '2' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1' });
  });

  it('should update data on multiple results', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'First' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'First' });

    subjects.query.next(makeResult({ id: '1', name: 'Second' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Second' });
    unmount();
  });

  it('should apply patch-based updates', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Alice' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: {
          cache: {
            patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
          },
        },
      }),
    );
    await nextTick();

    expect(result.data.value).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    await nextTick();

    expect(result.metadata.value).toEqual(testMetadata);
    unmount();
  });
});

describe('useQuery data ownership', () => {
  it('resets data when variables change', async () => {
    const { client, subjects } = createMockClient();
    const id = ref('a');
    const { result, unmount } = withSetup(
      () => useQuery(mockQuery as MockQueryWithVars, () => ({ id: id.value })),
      client,
    );

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    await nextTick();
    expect(result.data.value).toEqual({ id: 'a', name: 'first' });

    id.value = 'b';
    await nextTick();

    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(true);
    expect(result.error.value).toBeUndefined();
    expect(result.previousData.value).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(makeResult({ id: 'b', name: 'second' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: 'b', name: 'second' });
    expect(result.previousData.value).toEqual({ id: 'a', name: 'first' });
    unmount();
  });

  it('shows new data with no loading frame on a synchronous source', async () => {
    const executeQuery = vi.fn((_artifact: unknown, variables: unknown) =>
      fromValue(makeResult({ echo: stringify(variables) })),
    );
    const client = { executeQuery } as unknown as Client;
    const id = ref('a');
    const { result, unmount } = withSetup(
      () => useQuery(mockQuery as MockQueryWithVars, () => ({ id: id.value })),
      client,
    );

    expect(result.data.value).toEqual({ echo: stringify({ id: 'a' }) });

    id.value = 'b';
    await nextTick();

    expect(result.data.value).toEqual({ echo: stringify({ id: 'b' }) });
    expect(result.loading.value).toBe(false);
    unmount();
  });

  it('keeps data while skipped with unchanged variables, resets when variables changed under skip', async () => {
    const { client, subjects } = createMockClient();
    const id = ref('a');
    const skip = ref(false);
    const composable = () =>
      useQuery(
        mockQuery as MockQueryWithVars,
        () => ({ id: id.value }),
        () => ({ skip: skip.value }),
      );
    const { result, unmount } = withSetup(composable, client);

    subjects.query.next(makeResult({ id: 'a' }));
    await nextTick();
    expect(result.data.value).toEqual({ id: 'a' });

    skip.value = true;
    await nextTick();
    expect(result.data.value).toEqual({ id: 'a' });
    expect(result.loading.value).toBe(false);

    id.value = 'b';
    await nextTick();

    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
    expect(result.previousData.value).toEqual({ id: 'a' });
    unmount();
  });

  it('attributes fresh initialData to the new key on variable change', async () => {
    const { client } = createMockClient();
    const id = ref('a');
    const seed = ref({ id: 'a', name: 'first' });
    const composable = () =>
      useQuery(
        mockQuery as MockNamedQuery,
        () => ({ id: id.value }),
        () => ({ initialData: seed.value }),
      );
    const { result, unmount } = withSetup(composable, client);

    expect(result.data.value).toEqual({ id: 'a', name: 'first' });
    expect(result.loading.value).toBe(false);

    seed.value = { id: 'b', name: 'second' };
    id.value = 'b';
    await nextTick();

    expect(result.data.value).toEqual({ id: 'b', name: 'second' });
    expect(result.loading.value).toBe(false);
    expect(result.previousData.value).toEqual({ id: 'a', name: 'first' });
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('attributes fresh initialData to the new key while skipped', async () => {
    const { client } = createMockClient();
    const id = ref('a');
    const seed = ref({ id: 'a', name: 'first' });
    const composable = () =>
      useQuery(
        mockQuery as MockNamedQuery,
        () => ({ id: id.value }),
        () => ({ initialData: seed.value, skip: true }),
      );
    const { result, unmount } = withSetup(composable, client);

    expect(result.data.value).toEqual({ id: 'a', name: 'first' });
    expect(result.loading.value).toBe(false);

    seed.value = { id: 'b', name: 'second' };
    id.value = 'b';
    await nextTick();

    expect(result.data.value).toEqual({ id: 'b', name: 'second' });
    expect(result.loading.value).toBe(false);
    expect(client.executeQuery).not.toHaveBeenCalled();
    unmount();
  });

  it('warns when the same initialData reference is reused across keys', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = createMockClient();
    const shared = { id: 'a', name: 'first' };
    const id = ref('a');
    const composable = () =>
      useQuery(
        mockQuery as MockNamedQuery,
        () => ({ id: id.value }),
        () => ({ initialData: shared }),
      );
    const { unmount } = withSetup(composable, client);

    id.value = 'b';
    await nextTick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[mearie]');
    expect(warn.mock.calls[0]?.[0]).toContain('initialData');
    warn.mockRestore();
    unmount();
  });
});

describe('useQuery modal reopen regression', () => {
  it('never shows the previous key data when reactivated with a different warmed key', async () => {
    const { client } = createSyncClient({
      [stringify({ ids: ['a'] })]: makeResult({ items: [{ id: 'a', secret: 'alpha' }] }),
      [stringify({ ids: ['b'] })]: makeResult({ items: [{ id: 'b', secret: null }] }),
    });

    const ids = ref<string[]>(['a']);
    const seen: unknown[] = [];
    const composable = () => {
      const query = useQuery(
        mockQuery as MockQueryWithIds,
        () => ({ ids: ids.value }),
        () => ({ skip: ids.value.length === 0 }),
      );

      watchEffect(() => {
        seen.push(query.data.value);
      });

      return query;
    };
    const { result, unmount } = withSetup(composable, client);

    expect(result.data.value).toEqual({ items: [{ id: 'a', secret: 'alpha' }] });

    // close: skip + variables reset in one change
    ids.value = [];
    await nextTick();
    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);

    // reopen with a different key
    const before = seen.length;
    ids.value = ['b'];
    await nextTick();

    expect(result.data.value).toEqual({ items: [{ id: 'b', secret: null }] });
    expect(result.loading.value).toBe(false);
    expect(seen.slice(before)).not.toContainEqual({ items: [{ id: 'a', secret: 'alpha' }] });
    unmount();
  });
});

describe('useQuery fine-grained reactivity', () => {
  it('preserves data reference identity through a patch', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: 'a', name: 'first' }));
    await nextTick();

    const before = result.data.value;
    expect(before).toEqual({ id: 'a', name: 'first' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    await nextTick();

    expect(result.data.value).toBe(before);
    expect(result.data.value).toEqual({ id: 'a', name: 'second' });
    unmount();
  });

  it('keeps a root-replaced payload reactive for later leaf patches', async () => {
    const { client, subjects } = createMockClient();
    let otherRuns = 0;
    let seenOther: unknown;

    const composable = () => {
      const query = useQuery(mockQuery);

      watchEffect(() => {
        seenOther = (query.data.value as { other?: string } | undefined)?.other;
        otherRuns += 1;
      });

      return query;
    };
    const { result, unmount } = withSetup(composable, client);

    subjects.query.next(makeResult({ id: 'a', name: 'first', other: 'x' }));
    await nextTick();
    expect(result.data.value).toEqual({ id: 'a', name: 'first', other: 'x' });

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: [], value: { id: 'b', name: 'second', other: 'y' } }] } },
      }),
    );
    await nextTick();

    expect(result.data.value).toEqual({ id: 'b', name: 'second', other: 'y' });
    expect(seenOther).toBe('y');
    const baseOtherRuns = otherRuns;

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'z' }] } },
      }),
    );
    await nextTick();

    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(seenOther).toBe('z');
    expect(result.data.value).toEqual({ id: 'b', name: 'second', other: 'z' });
    unmount();
  });

  it('re-runs only the effects that read the changed field, and no data reader on refetch', async () => {
    const { client, subjects } = createMockClient();
    let nameRuns = 0;
    let otherRuns = 0;
    let seenName: unknown;

    const composable = () => {
      const query = useQuery(mockQuery);

      watchEffect(() => {
        seenName = (query.data.value as { name?: string } | undefined)?.name;
        nameRuns += 1;
      });

      watchEffect(() => {
        void (query.data.value as { other?: string } | undefined)?.other;
        otherRuns += 1;
      });

      return query;
    };
    const { result, unmount } = withSetup(composable, client);

    subjects.query.next(makeResult({ id: 'a', name: 'first', other: 'x' }));
    await nextTick();

    expect(result.data.value).toEqual({ id: 'a', name: 'first', other: 'x' });
    const baseNameRuns = nameRuns;
    const baseOtherRuns = otherRuns;

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['other'], value: 'y' }] } },
      }),
    );
    await nextTick();

    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(nameRuns).toBe(baseNameRuns);

    subjects.query.next(
      makeResult(undefined, {
        metadata: { cache: { patches: [{ type: 'set', path: ['name'], value: 'second' }] } },
      }),
    );
    await nextTick();

    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(seenName).toBe('second');
    expect(otherRuns).toBe(baseOtherRuns + 1);
    expect(result.data.value).toEqual({ id: 'a', name: 'second', other: 'y' });

    result.refetch();
    await nextTick();

    expect(result.loading.value).toBe(true);
    expect(nameRuns).toBe(baseNameRuns + 1);
    expect(otherRuns).toBe(baseOtherRuns + 1);
    unmount();
  });
});
