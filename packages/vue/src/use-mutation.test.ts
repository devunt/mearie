import { describe, it, expect } from 'vitest';
import { AggregatedError } from '@mearie/core';
import { makeSubject } from '@mearie/core/stream';
import type { OperationResult } from '@mearie/core';
import { useMutation } from './use-mutation.ts';
import { createMockClient, withSetup, mockMutation, makeResult } from './test-utils.ts';

describe('useMutation', () => {
  it('should have correct initial state', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [, state] = result;
    expect(state.loading.value).toBe(false);
    expect(state.data.value).toBeUndefined();
    expect(state.error.value).toBeUndefined();
    unmount();
  });

  it('should execute and return data on success', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute, state] = result;
    const promise = execute();

    expect(state.loading.value).toBe(true);

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();

    const data = await promise;
    expect(data).toEqual({ id: '1' });
    expect(state.loading.value).toBe(false);
    expect(state.data.value).toEqual({ id: '1' });
    expect(state.error.value).toBeUndefined();
    unmount();
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute, state] = result;
    const promise = execute();

    subjects.mutation.next(makeResult(undefined, { errors: [{ message: 'Validation failed' }] }));
    subjects.mutation.complete();

    await expect(promise).rejects.toThrow(AggregatedError);
    expect(state.error.value).toBeInstanceOf(AggregatedError);
    expect(state.loading.value).toBe(false);
    unmount();
  });

  it('should handle network errors', async () => {
    const { client } = createMockClient();
    client.executeMutation.mockReturnValue(() => {
      throw new Error('Network error');
    });

    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute, state] = result;
    await expect(execute()).rejects.toThrow('Network error');

    expect(state.loading.value).toBe(false);
    unmount();
  });

  it('should reset state on sequential executions', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute, state] = result;

    const promise1 = execute();
    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise1;

    expect(state.data.value).toEqual({ id: '1' });

    const newSubject = makeSubject<OperationResult>();
    client.executeMutation.mockReturnValue(newSubject.source);

    const promise2 = execute();

    expect(state.loading.value).toBe(true);
    expect(state.error.value).toBeUndefined();

    newSubject.next(makeResult({ id: '2' }));
    newSubject.complete();
    await promise2;

    expect(state.data.value).toEqual({ id: '2' });
    unmount();
  });

  it('should forward variables', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute] = result;
    const promise = execute();

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise;

    expect(client.executeMutation).toHaveBeenCalledWith(mockMutation, undefined, undefined);
    unmount();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = withSetup(() => useMutation(mockMutation), client);

    const [execute, state] = result;
    const promise = execute();

    const testMetadata = { cache: { stale: true } };
    subjects.mutation.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    subjects.mutation.complete();
    await promise;

    expect(state.metadata.value).toEqual(testMetadata);
    unmount();
  });
});
