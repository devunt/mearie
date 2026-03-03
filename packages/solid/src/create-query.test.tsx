import { describe, it, expect } from 'vitest';
import { AggregatedError } from '@mearie/core';
import { createQuery } from './create-query.ts';
import { createMockClient, renderHook, mockQuery, makeResult } from './test-utils.tsx';

describe('createQuery', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

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
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    expect(result.current.error!.errors[0]!.message).toBe('Not found');
    dispose();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery, undefined, () => ({ skip: true })), client);

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    dispose();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, dispose } = renderHook(() => createQuery(mockQuery, undefined, () => ({ initialData })), client);

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);
    dispose();
  });

  it('should re-execute on refetch', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

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

  it('should unsubscribe on dispose', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1' }));

    dispose();

    subjects.query.next(makeResult({ id: '2' }));

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should update data on multiple results', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

    subjects.query.next(makeResult({ id: '1', name: 'First' }));

    expect(result.current.data).toEqual({ id: '1', name: 'First' });

    subjects.query.next(makeResult({ id: '1', name: 'Second' }));

    expect(result.current.data).toEqual({ id: '1', name: 'Second' });
    dispose();
  });

  it('should apply patch-based updates', () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

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
    const { result, dispose } = renderHook(() => createQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));

    expect(result.current.metadata).toEqual(testMetadata);
    dispose();
  });
});
