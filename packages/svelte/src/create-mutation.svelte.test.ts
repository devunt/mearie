import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Artifact, Client, OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { makeSubject } from '@mearie/core/stream';
import { createMutation } from './create-mutation.svelte.ts';
import { createMockClient, mockMutation, makeResult } from './test-utils.svelte.ts';
import HookRunner from './HookRunner.svelte';
import type { Mutation } from './create-mutation.svelte.ts';

const mockMutationWithVars: Artifact<'mutation', string, unknown, { name: string }> = {
  kind: 'mutation',
  name: 'TestMutation',
  body: 'mutation TestMutation { updateUser { id } }',
  selections: [],
};

const renderMutation = <T extends Artifact<'mutation'>>(
  client: Client,
  artifact: T = mockMutation as Artifact<'mutation'> as T,
): {
  result: { current: Mutation<T> };
  destroy: () => void;
} => {
  const result = { current: undefined as unknown as Mutation<T> };
  const target = document.createElement('div');

  const component = mount(HookRunner, {
    target,
    props: {
      client,
      hookFn: () => createMutation(artifact),
      onResult: (r: unknown) => {
        result.current = r as Mutation<T>;
      },
    },
  });

  flushSync();
  return { result, destroy: () => void unmount(component) };
};

describe('createMutation', () => {
  it('should have correct initial state', () => {
    const { client } = createMockClient();
    const { result, destroy } = renderMutation(client);

    const [, state] = result.current;
    expect(state.loading).toBe(false);
    expect(state.data).toBeUndefined();
    expect(state.error).toBeUndefined();
    destroy();
  });

  it('should execute and return data on success', async () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderMutation(client);

    const [execute] = result.current;
    const promise = execute();
    flushSync();

    expect(result.current[1].loading).toBe(true);

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();

    const data = await promise;
    flushSync();

    expect(data).toEqual({ id: '1' });
    expect(result.current[1].loading).toBe(false);
    expect(result.current[1].data).toEqual({ id: '1' });
    expect(result.current[1].error).toBeUndefined();
    destroy();
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderMutation(client);

    const [execute] = result.current;
    const promise = execute();

    subjects.mutation.next(makeResult(undefined, { errors: [{ message: 'Validation failed' }] }));
    subjects.mutation.complete();

    await expect(promise).rejects.toThrow(AggregatedError);
    flushSync();

    expect(result.current[1].error).toBeInstanceOf(AggregatedError);
    expect(result.current[1].loading).toBe(false);
    destroy();
  });

  it('should handle network errors', async () => {
    const { client } = createMockClient();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeMutation).mockImplementation(() => {
      throw new Error('Network error');
    });

    const { result, destroy } = renderMutation(client);

    const [execute] = result.current;
    await expect(execute()).rejects.toThrow('Network error');
    flushSync();

    expect(result.current[1].loading).toBe(false);
    destroy();
  });

  it('should reset state on sequential executions', async () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderMutation(client);

    const [execute] = result.current;
    const promise1 = execute();

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise1;
    flushSync();

    expect(result.current[1].data).toEqual({ id: '1' });

    const newSubject = makeSubject<OperationResult>();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(client.executeMutation).mockReturnValue(newSubject.source);

    const promise2 = execute();
    flushSync();

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toBeUndefined();

    newSubject.next(makeResult({ id: '2' }));
    newSubject.complete();
    await promise2;
    flushSync();

    expect(result.current[1].data).toEqual({ id: '2' });
    destroy();
  });

  it('should forward variables', async () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderMutation(client, mockMutationWithVars);

    const [execute] = result.current;
    const promise = execute({ name: 'test' });

    subjects.mutation.next(makeResult({ id: '1' }));
    subjects.mutation.complete();
    await promise;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeMutation).toHaveBeenCalledWith(mockMutationWithVars, { name: 'test' }, undefined);
    destroy();
  });

  it('should expose metadata', async () => {
    const { client, subjects } = createMockClient();
    const { result, destroy } = renderMutation(client);

    const [execute] = result.current;
    const promise = execute();

    const testMetadata = { cache: { stale: true } };
    subjects.mutation.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    subjects.mutation.complete();
    await promise;
    flushSync();

    expect(result.current[1].metadata).toEqual(testMetadata);
    destroy();
  });
});
