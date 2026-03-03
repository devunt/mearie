import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import type { Client, OperationResult } from '@mearie/core';
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

export const renderHook = <T>(hook: () => T, client: Client): { result: { current: T }; unmount: () => void } => {
  const result = { current: undefined as T };
  const container = document.createElement('div');
  const root = createRoot(container);

  const TestComponent = (): null => {
    result.current = hook();
    return null;
  };

  act(() => {
    root.render(createElement(ClientProvider, { client, children: createElement(TestComponent) }));
  });

  return {
    result,
    unmount: () => act(() => root.unmount()),
  };
};

export const mockQuery = {
  kind: 'query' as const,
  name: 'TestQuery',
  body: 'query TestQuery { user { id name } }',
  selections: [],
};

export const mockMutation = {
  kind: 'mutation' as const,
  name: 'TestMutation',
  body: 'mutation TestMutation { updateUser { id } }',
  selections: [],
};

export const mockSubscription = {
  kind: 'subscription' as const,
  name: 'TestSubscription',
  body: 'subscription TestSubscription { onUpdate { id } }',
  selections: [],
};

export const mockFragment = {
  kind: 'fragment' as const,
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
