import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import type { Artifact, Client } from '@mearie/core';
import { AggregatedError, stringify } from '@mearie/core';
import { fromValue } from '@mearie/core/stream';
import { useQuery } from './use-query.ts';
import { createMockClient, renderHook, renderHookWithProps, mockQuery, makeResult } from './test-utils.ts';

type MockQueryWithVars = Artifact<'query', string, unknown, { id: string }>;

describe('useQuery', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    expect(result.current.error).toBeUndefined();
    unmount();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    expect(result.current.error!.errors[0]!.message).toBe('Not found');
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { skip: true }), client);

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    unmount();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('should update data after initialData when fetch completes', () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('should re-execute on refetch', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1' }));
    });

    expect(result.current.data).toEqual({ id: '1' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    unmount();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1' }));
    });

    unmount();

    act(() => {
      subjects.query.next(makeResult({ id: '2' }));
    });

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should update data on multiple results', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'First' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'First' });

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Second' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Second' });
    unmount();
  });

  it('should apply patch-based updates', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });

    act(() => {
      subjects.query.next(
        makeResult(undefined, {
          metadata: {
            cache: {
              patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
            },
          },
        }),
      );
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    act(() => {
      subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    });

    expect(result.current.metadata).toEqual(testMetadata);
    unmount();
  });
});

describe('useQuery data ownership', () => {
  it('resets data in the same render when variables change', () => {
    const { client, subjects } = createMockClient();
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { id: string }) => useQuery(mockQuery as MockQueryWithVars, { id: props.id }),
      { id: 'a' },
      client,
    );

    act(() => subjects.query.next(makeResult({ id: 'a', name: 'first' })));
    expect(result.current.data).toEqual({ id: 'a', name: 'first' });

    rerender({ id: 'b' });

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });

    act(() => subjects.query.next(makeResult({ id: 'b', name: 'second' })));
    expect(result.current.data).toEqual({ id: 'b', name: 'second' });
    expect(result.current.previousData).toEqual({ id: 'a', name: 'first' });
    unmount();
  });

  it('settles synchronously before paint on a synchronous source', () => {
    const executeQuery = vi.fn((_q: unknown, variables: unknown) =>
      fromValue(makeResult({ echo: stringify(variables) })),
    );
    const client = { executeQuery } as unknown as Client;
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { id: string }) => useQuery(mockQuery as MockQueryWithVars, { id: props.id }),
      { id: 'a' },
      client,
    );

    expect(result.current.data).toEqual({ echo: stringify({ id: 'a' }) });

    rerender({ id: 'b' });

    expect(result.current.data).toEqual({ echo: stringify({ id: 'b' }) });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('resets when variables changed under skip', () => {
    const { client, subjects } = createMockClient();
    const { result, rerender, unmount } = renderHookWithProps(
      (props: { id: string; skip: boolean }) =>
        useQuery(mockQuery as MockQueryWithVars, { id: props.id }, { skip: props.skip }),
      { id: 'a', skip: false },
      client,
    );

    act(() => subjects.query.next(makeResult({ id: 'a' })));
    expect(result.current.data).toEqual({ id: 'a' });

    rerender({ id: 'a', skip: true });
    expect(result.current.data).toEqual({ id: 'a' });
    expect(result.current.loading).toBe(false);

    rerender({ id: 'b', skip: true });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.previousData).toEqual({ id: 'a' });
    unmount();
  });
});
