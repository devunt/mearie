import type { Operation, OperationResult, ExchangeIO, Exchange, RequestOperation } from '../exchange.ts';
import type { ArtifactKind, Artifact, Selection, SchemaMeta } from '@mearie/shared';
import type { Client } from '../client.ts';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';
import { vi } from 'vitest';
import { subscribe } from '../stream/sinks/subscribe.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';

let operationCounter = 0;

export type TestOperationOptions = {
  variant?: 'request' | 'teardown';
  kind?: ArtifactKind;
  name?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  key?: string;
  selections?: readonly Selection[];
};

export const makeTestOperation = (options: TestOperationOptions = {}): Operation => {
  const {
    variant = 'request',
    kind = 'query',
    name = `TestOperation${operationCounter}`,
    variables = {},
    metadata = {},
    key = `op-${++operationCounter}`,
    selections = [],
  } = options;

  if (variant === 'teardown') {
    return {
      variant: 'teardown',
      key,
      metadata,
    };
  }

  const artifact: Artifact = {
    kind,
    name,
    body: '',
    selections,
  };

  return {
    variant: 'request',
    key,
    metadata,
    artifact,
    variables,
  } as RequestOperation;
};

export type ForwardHandler = (operation: Operation) => Partial<OperationResult>;

export const makeTestForward = (handler?: ForwardHandler): ExchangeIO => {
  return (ops$) =>
    pipe(
      ops$,
      map((op): OperationResult => {
        if (handler) {
          const result = handler(op);
          return {
            operation: op,
            data: result.data,
            errors: result.errors,
            extensions: result.extensions,
            stale: result.stale,
          };
        } else {
          return { operation: op };
        }
      }),
    );
};

export const makeTestClient = (schema: SchemaMeta): Pick<Client, 'schema'> => {
  return {
    schema,
  };
};

export const testExchange = async (
  exchange: Exchange,
  forward: ExchangeIO,
  operations: Operation[],
  client?: Pick<Client, 'schema'>,
): Promise<OperationResult[]> => {
  const results: OperationResult[] = [];
  vi.useFakeTimers();

  const subject = makeSubject<Operation>();

  const unsubscribe = pipe(
    subject.source,
    exchange({ forward, client: (client ?? null) as never }),
    subscribe({
      next: (result) => {
        results.push(result);
      },
    }),
  );

  for (const operation of operations) {
    subject.next(operation);
    await Promise.resolve();
  }

  subject.complete();

  await vi.runAllTimersAsync();
  vi.useRealTimers();

  unsubscribe();

  return results;
};
