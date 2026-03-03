import { describe, it, expect, type Mock } from 'vitest';
import type { Artifact, OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { makeSubject } from '@mearie/core/stream';
import { createMutation } from './create-mutation.ts';
import { createMockClient, renderPrimitive, mockMutation, makeResult } from './test-utils.tsx';

describe('createMutation', () => {
  it('should have correct initial state', () => {
    const { client } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [, state] = result.current;
    expect(state.loading).toBe(false);
    expect(state.data).toBeUndefined();
    expect(state.error).toBeUndefined();
    dispose();
  });

  it('should execute and return data on success', async () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [execute, state] = result.current;

    const promise = execute();

    expect(state.loading).toBe(true);

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();

    const data = await promise;
    expect(data).toEqual({ id: '1' });
    expect(state.loading).toBe(false);
    expect(state.data).toEqual({ id: '1' });
    expect(state.error).toBeUndefined();
    dispose();
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [execute, state] = result.current;

    const promise = execute();

    subjects.mutation.next(makeResult(undefined, { errors: [{ message: 'Validation failed' }] }));
    subjects.mutation.complete();

    await expect(promise).rejects.toThrow(AggregatedError);
    expect(state.error).toBeInstanceOf(AggregatedError);
    expect(state.loading).toBe(false);
    dispose();
  });

  it('should handle network errors', async () => {
    const { client } = createMockClient();
    (client.executeMutation as unknown as Mock).mockReturnValue(() => {
      throw new Error('Network error');
    });

    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [execute, state] = result.current;

    await expect(execute()).rejects.toThrow('Network error');
    expect(state.loading).toBe(false);
    dispose();
  });

  it('should reset state on sequential executions', async () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [execute, state] = result.current;

    const promise1 = execute();
    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise1;

    expect(state.data).toEqual({ id: '1' });

    const newSubject = makeSubject<OperationResult>();
    (client.executeMutation as unknown as Mock).mockReturnValue(newSubject.source);

    const promise2 = execute();

    expect(state.loading).toBe(true);
    expect(state.error).toBeUndefined();

    newSubject.next(makeResult({ id: '2' }));
    newSubject.complete();
    await promise2;

    expect(state.data).toEqual({ id: '2' });
    dispose();
  });

  it('should forward variables', async () => {
    const mockMutationWithVars: Artifact<'mutation', 'TestMutation', unknown, { name: string }> = {
      kind: 'mutation',
      name: 'TestMutation',
      body: 'mutation TestMutation { updateUser { id } }',
      selections: [],
    };
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutationWithVars), client);

    const [execute] = result.current;

    const promise = execute({ name: 'test' });

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeMutation).toHaveBeenCalledWith(mockMutationWithVars, { name: 'test' }, undefined);
    dispose();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, dispose } = renderPrimitive(() => createMutation(mockMutation), client);

    const [execute, state] = result.current;

    const promise = execute();

    const testMetadata = { cache: { stale: true } };
    subjects.mutation.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    subjects.mutation.complete();
    await promise;

    expect(state.metadata).toEqual(testMetadata);
    dispose();
  });
});
