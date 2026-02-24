import { describe, it, expect } from 'vitest';
import type { Artifact, Selection } from '@mearie/shared';
import type { Exchange, Operation, OperationResult } from './exchange.ts';
import { createClient } from './client.ts';
import { AggregatedError, GraphQLError, ExchangeError } from './errors.ts';
import { pipe } from './stream/pipe.ts';
import { filter } from './stream/operators/filter.ts';
import { fromPromise } from './stream/sources/from-promise.ts';
import { mergeMap } from './stream/operators/merge-map.ts';

const testSchema = {
  entities: {},
  inputs: {},
  scalars: {},
};

const makeArtifact = <K extends 'query' | 'mutation'>(
  kind: K,
  name = 'Test',
  selections: readonly Selection[] = [],
): Artifact<K, string, unknown, undefined> => ({
  kind,
  name,
  body: `${kind} { test }`,
  selections,
});

const makeMockExchange = (handler: (op: Operation) => Partial<OperationResult>): Exchange => {
  return () => {
    return (ops$) =>
      pipe(
        ops$,
        filter((op) => op.variant === 'request'),
        mergeMap((op) =>
          fromPromise(
            Promise.resolve({
              operation: op,
              ...handler(op),
            } as OperationResult),
          ),
        ),
      );
  };
};

describe('Client.query()', () => {
  it('should return data on success', async () => {
    const exchange = makeMockExchange(() => ({
      data: { user: { id: '1', name: 'John' } },
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const query = makeArtifact('query', 'GetUser', [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ]);
    const data = await client.query(query);

    expect(data).toEqual({ user: { id: '1', name: 'John' } });
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const exchange = makeMockExchange(() => ({
      errors: [new GraphQLError('Not found')],
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const query = makeArtifact('query', 'GetUser');

    await expect(client.query(query)).rejects.toThrow(AggregatedError);
  });

  it('should throw AggregatedError on network errors', async () => {
    const exchange = makeMockExchange(() => ({
      errors: [new ExchangeError('Network error', { exchangeName: 'http' })],
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const query = makeArtifact('query', 'GetUser');

    await expect(client.query(query)).rejects.toThrow(AggregatedError);
  });
});

describe('Client.mutation()', () => {
  it('should return data on success', async () => {
    const exchange = makeMockExchange(() => ({
      data: { createUser: { id: '2', name: 'Jane' } },
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const mutation = makeArtifact('mutation', 'CreateUser', [
      {
        kind: 'Field',
        name: 'createUser',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ]);
    const data = await client.mutation(mutation);

    expect(data).toEqual({ createUser: { id: '2', name: 'Jane' } });
  });

  it('should throw AggregatedError on GraphQL errors', async () => {
    const exchange = makeMockExchange(() => ({
      errors: [new GraphQLError('Validation failed')],
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const mutation = makeArtifact('mutation', 'CreateUser');

    await expect(client.mutation(mutation)).rejects.toThrow(AggregatedError);
  });

  it('should throw AggregatedError on network errors', async () => {
    const exchange = makeMockExchange(() => ({
      errors: [new ExchangeError('HTTP 500: Internal Server Error', { exchangeName: 'http' })],
    }));

    const client = createClient({
      schema: testSchema,
      exchanges: [exchange],
    });

    const mutation = makeArtifact('mutation', 'CreateUser');

    await expect(client.mutation(mutation)).rejects.toThrow(AggregatedError);
  });
});
