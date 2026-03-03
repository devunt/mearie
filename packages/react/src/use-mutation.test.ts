import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import type { OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import type { Source, Subscription } from '@mearie/core/stream';
import { makeSubject } from '@mearie/core/stream';
import { useMutation } from './use-mutation.ts';
import { createMockClient, renderHook, mockMutation, makeResult } from './test-utils.ts';

describe('useMutation', () => {
  it('should have correct initial state', () => {
    const { client } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    const [, state] = result.current;
    expect(state.loading).toBe(false);
    expect(state.data).toBeUndefined();
    expect(state.error).toBeUndefined();
    unmount();
  });

  it('should execute and return data on success', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    let promise: Promise<unknown>;
    act(() => {
      promise = result.current[0]();
    });

    expect(result.current[1].loading).toBe(true);

    await act(async () => {
      subjects.mutation.next(makeResult({ id: '1' }));
      subjects.mutation.complete();
      await promise!;
    });

    expect(result.current[1].loading).toBe(false);
    expect(result.current[1].data).toEqual({ id: '1' });
    expect(result.current[1].error).toBeUndefined();
    unmount();
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    await act(async () => {
      const promise = result.current[0]();
      subjects.mutation.next(makeResult(undefined, { errors: [{ message: 'Validation failed' }] }));
      subjects.mutation.complete();
      await expect(promise).rejects.toThrow(AggregatedError);
    });

    expect(result.current[1].error).toBeInstanceOf(AggregatedError);
    expect(result.current[1].loading).toBe(false);
    unmount();
  });

  it('should handle network errors', async () => {
    const { client } = createMockClient();
    const throwingSource: Source<OperationResult> = (): Subscription => {
      throw new Error('Network error');
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeMutation).mockReturnValue(throwingSource);

    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow('Network error');
    });

    expect(result.current[1].loading).toBe(false);
    unmount();
  });

  it('should reset state on sequential executions', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    let mutationPromise: Promise<unknown>;
    act(() => {
      mutationPromise = result.current[0]();
    });

    await act(async () => {
      subjects.mutation.next(makeResult({ id: '1' }));
      subjects.mutation.complete();
      await mutationPromise;
    });

    expect(result.current[1].data).toEqual({ id: '1' });

    const newSubject = makeSubject<OperationResult>();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeMutation).mockReturnValue(newSubject.source);

    act(() => {
      mutationPromise = result.current[0]();
    });

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toBeUndefined();

    await act(async () => {
      newSubject.next(makeResult({ id: '2' }));
      newSubject.complete();
      await mutationPromise;
    });

    expect(result.current[1].data).toEqual({ id: '2' });
    unmount();
  });

  it('should forward variables', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    let mutationPromise: Promise<unknown>;
    act(() => {
      mutationPromise = result.current[0]({ name: 'test' } as unknown as undefined);
    });

    await act(async () => {
      subjects.mutation.next(makeResult({ id: '1' }));
      subjects.mutation.complete();
      await mutationPromise;
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeMutation).toHaveBeenCalledWith(mockMutation, { name: 'test' }, undefined);
    unmount();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useMutation(mockMutation), client);

    let mutationPromise: Promise<unknown>;
    act(() => {
      mutationPromise = result.current[0]();
    });

    const testMetadata = { cache: { stale: false } };
    await act(async () => {
      subjects.mutation.next(makeResult({ id: '1' }, { metadata: testMetadata }));
      subjects.mutation.complete();
      await mutationPromise;
    });

    expect(result.current[1].metadata).toEqual(testMetadata);
    unmount();
  });
});
