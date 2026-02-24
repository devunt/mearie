import type { Operation, OperationResult, ExchangeIO, Exchange, RequestOperation } from '../exchange.ts';
import type { ArtifactKind, Artifact, Selection, SchemaMeta, VariableDef } from '@mearie/shared';
import type { Client } from '../client.ts';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';
import { vi } from 'vitest';
import { subscribe } from '../stream/sinks/subscribe.ts';
import { makeSubject } from '../stream/sources/make-subject.ts';
import type { ScalarsConfig } from '../scalars.ts';

let operationCounter = 0;

export type TestOperationOptions = {
  variant?: 'request' | 'teardown';
  kind?: ArtifactKind;
  name?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  key?: string;
  selections?: readonly Selection[];
  variableDefs?: readonly VariableDef[];
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
    variableDefs = [],
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
    variableDefs,
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

export const makeTestClient = <TMeta extends SchemaMeta = SchemaMeta>(config: {
  schema: TMeta;
  scalars?: ScalarsConfig<TMeta>;
}): Pick<Client<TMeta>, 'schema' | 'scalars'> => {
  return {
    schema: config.schema,
    scalars: config.scalars,
  };
};

export const testExchange = async (
  exchange: Exchange,
  forward: ExchangeIO,
  operations: Operation[],
  client?: Pick<Client, 'schema' | 'scalars'>,
): Promise<OperationResult[]> => {
  const results: OperationResult[] = [];
  vi.useFakeTimers();

  const subject = makeSubject<Operation>();

  const unsubscribe = pipe(
    subject.source,
    exchange({ forward, client: (client ?? null) as never }).io,
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
