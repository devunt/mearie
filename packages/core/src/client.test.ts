import { describe, it, expect, vi } from 'vitest';
import type { Artifact, Selection } from '@mearie/shared';
import type { Exchange, Operation, OperationResult } from './exchange.ts';
import { createClient } from './client.ts';
import { AggregatedError, GraphQLError, ExchangeError } from './errors.ts';
import { pipe } from './stream/pipe.ts';
import { filter } from './stream/operators/filter.ts';
import { tap } from './stream/operators/tap.ts';
import { fromPromise } from './stream/sources/from-promise.ts';
import { mergeMap } from './stream/operators/merge-map.ts';
import { subscribe } from './stream/sinks/subscribe.ts';

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
  return () => ({
    name: 'mock',
    io: (ops$) =>
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
      ),
  });
};

const makeDelayedMockExchange = (handler: (op: Operation) => Partial<OperationResult>, delayMs: number): Exchange => {
  return () => ({
    name: 'mock',
    io: (ops$) =>
      pipe(
        ops$,
        filter((op) => op.variant === 'request'),
        mergeMap((op) =>
          fromPromise(
            new Promise<OperationResult>((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    operation: op,
                    ...handler(op),
                  } as OperationResult),
                delayMs,
              ),
            ),
          ),
        ),
      ),
  });
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

describe('AbortSignal support', () => {
  describe('executeQuery / executeMutation with signal', () => {
    it('should complete stream and send teardown to exchange when signal aborts', async () => {
      const teardownSpy = vi.fn();

      const exchange: Exchange = () => ({
        name: 'mock',
        io: (ops$) =>
          pipe(
            ops$,
            tap((op) => {
              if (op.variant === 'teardown') teardownSpy(op.key);
            }),
            filter((op) => op.variant === 'request'),
            mergeMap((op) =>
              fromPromise(
                new Promise<OperationResult>((resolve) =>
                  setTimeout(() => resolve({ operation: op, data: { test: true } } as OperationResult), 100),
                ),
              ),
            ),
          ),
      });

      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const query = makeArtifact('query', 'GetUser');
      const controller = new AbortController();

      const values: OperationResult[] = [];
      let completed = false;

      pipe(
        client.executeQuery(query, undefined, { signal: controller.signal }),
        subscribe({
          next(value) {
            values.push(value);
          },
          complete() {
            completed = true;
          },
        }),
      );

      controller.abort();

      await new Promise((r) => setTimeout(r, 10));

      expect(completed).toBe(true);
      expect(values).toHaveLength(0);
      expect(teardownSpy).toHaveBeenCalled();
    });

    it('should complete immediately when signal is already aborted', async () => {
      const exchange = makeMockExchange(() => ({
        data: { test: true },
      }));

      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const query = makeArtifact('query', 'GetUser');

      const controller = new AbortController();
      controller.abort();

      let completed = false;
      const values: OperationResult[] = [];

      pipe(
        client.executeQuery(query, undefined, { signal: controller.signal }),
        subscribe({
          next(value) {
            values.push(value);
          },
          complete() {
            completed = true;
          },
        }),
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(completed).toBe(true);
      expect(values).toHaveLength(0);
    });

    it('should work normally without signal (regression)', async () => {
      const exchange = makeMockExchange(() => ({
        data: { user: { id: '1' } },
      }));

      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const query = makeArtifact('query', 'GetUser');

      const data = await client.query(query);
      expect(data).toEqual({ user: { id: '1' } });
    });
  });

  describe('query() promise with signal', () => {
    it('should reject with abort reason when aborted before response', async () => {
      const exchange = makeDelayedMockExchange(() => ({ data: { test: true } }), 100);
      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const query = makeArtifact('query', 'GetUser');

      const controller = new AbortController();
      const promise = client.query(query, undefined, { signal: controller.signal });

      controller.abort();

      await expect(promise).rejects.toBeDefined();
    });

    it('should throw immediately when signal is already aborted', async () => {
      const exchange = makeMockExchange(() => ({ data: { test: true } }));
      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const query = makeArtifact('query', 'GetUser');

      const controller = new AbortController();
      controller.abort();

      await expect(client.query(query, undefined, { signal: controller.signal })).rejects.toBeDefined();
    });
  });

  describe('mutation() promise with signal', () => {
    it('should reject with abort reason when aborted before response', async () => {
      const exchange = makeDelayedMockExchange(() => ({ data: { test: true } }), 100);
      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const mutation = makeArtifact('mutation', 'CreateUser');

      const controller = new AbortController();
      const promise = client.mutation(mutation, undefined, { signal: controller.signal });

      controller.abort();

      await expect(promise).rejects.toBeDefined();
    });

    it('should throw immediately when signal is already aborted', async () => {
      const exchange = makeMockExchange(() => ({ data: { test: true } }));
      const client = createClient({ schema: testSchema, exchanges: [exchange] });
      const mutation = makeArtifact('mutation', 'CreateUser');

      const controller = new AbortController();
      controller.abort();

      await expect(client.mutation(mutation, undefined, { signal: controller.signal })).rejects.toBeDefined();
    });
  });
});
