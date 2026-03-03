import { render } from 'solid-js/web';
import { vi } from 'vitest';
import type { Artifact, Client, OperationResult } from '@mearie/core';
import { GraphQLError } from '@mearie/core';
import { makeSubject } from '@mearie/core/stream';
import { ClientProvider } from './client-provider.tsx';

export const createMockClient = () => {
  const subjects = {
    query: makeSubject<OperationResult>(),
    mutation: makeSubject<OperationResult>(),
    subscription: makeSubject<OperationResult>(),
    fragment: makeSubject<OperationResult>(),
  };

  const client = {
    executeQuery: vi.fn(() => subjects.query.source),
    executeMutation: vi.fn(() => subjects.mutation.source),
    executeSubscription: vi.fn(() => subjects.subscription.source),
    executeFragment: vi.fn(() => subjects.fragment.source),
  } as unknown as Client;

  return { client, subjects };
};

export const renderPrimitive = <T,>(
  primitive: () => T,
  client: Client,
): { result: { current: T }; dispose: () => void } => {
  const result = { current: undefined as T };
  const container = document.createElement('div');

  const dispose = render(() => {
    return (
      <ClientProvider client={client}>
        {(() => {
          result.current = primitive();
          return null;
        })()}
      </ClientProvider>
    );
  }, container);

  return { result, dispose };
};

export const mockQuery: Artifact<'query', 'TestQuery', unknown, Record<string, never>> = {
  kind: 'query',
  name: 'TestQuery',
  body: 'query TestQuery { user { id name } }',
  selections: [],
};

export const mockMutation: Artifact<'mutation', 'TestMutation', unknown, Record<string, never>> = {
  kind: 'mutation',
  name: 'TestMutation',
  body: 'mutation TestMutation { updateUser { id } }',
  selections: [],
};

export const mockSubscription: Artifact<'subscription', 'TestSubscription', unknown, Record<string, never>> = {
  kind: 'subscription',
  name: 'TestSubscription',
  body: 'subscription TestSubscription { onUpdate { id } }',
  selections: [],
};

export const mockFragment: Artifact<'fragment', 'TestFragment', unknown, Record<string, never>> = {
  kind: 'fragment',
  name: 'TestFragment',
  body: 'fragment TestFragment on User { id name }',
  selections: [],
};

export const makeResult = (
  data: unknown,
  opts?: { errors?: { message: string }[]; metadata?: OperationResult['metadata'] },
): OperationResult => ({
  data,
  errors: opts?.errors?.map((e) => new GraphQLError(e.message)),
  metadata: opts?.metadata,
  operation: {} as OperationResult['operation'],
});
