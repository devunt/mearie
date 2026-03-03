import { createApp, type App } from 'vue';
import { vi, type Mock } from 'vitest';
import type { Artifact, Client, OperationResult } from '@mearie/core';
import { GraphQLError } from '@mearie/core';
import type { Source } from '@mearie/core/stream';
import { makeSubject } from '@mearie/core/stream';
import { ClientPlugin } from './client-plugin.ts';

type MockClient = Client & {
  executeQuery: Mock<(...args: unknown[]) => Source<OperationResult>>;
  executeMutation: Mock<(...args: unknown[]) => Source<OperationResult>>;
  executeSubscription: Mock<(...args: unknown[]) => Source<OperationResult>>;
  executeFragment: Mock<(...args: unknown[]) => Source<OperationResult>>;
};

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
  } as unknown as MockClient;

  return { client, subjects };
};

export const withSetup = <T>(composable: () => T, client: Client): { result: T; app: App; unmount: () => void } => {
  let result!: T;
  const app = createApp({
    setup() {
      result = composable();
      return () => null;
    },
  });
  app.config.warnHandler = () => {};
  app.use(ClientPlugin, { client });
  const container = document.createElement('div');
  app.mount(container);
  return { result, app, unmount: () => app.unmount() };
};

type MockArtifact<K extends Artifact['kind']> = Artifact<K, string, unknown, Record<string, never>>;

export const mockQuery: MockArtifact<'query'> = {
  kind: 'query',
  name: 'TestQuery',
  body: 'query TestQuery { user { id name } }',
  selections: [],
};

export const mockMutation: MockArtifact<'mutation'> = {
  kind: 'mutation',
  name: 'TestMutation',
  body: 'mutation TestMutation { updateUser { id } }',
  selections: [],
};

export const mockSubscription: MockArtifact<'subscription'> = {
  kind: 'subscription',
  name: 'TestSubscription',
  body: 'subscription TestSubscription { onUpdate { id } }',
  selections: [],
};

export const mockFragment: Artifact<'fragment', 'TestFragment'> = {
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
