import type { Artifact, OperationKind } from '@mearie/shared';
import type { Exchange, Operation, OperationResult } from './exchange.ts';
import { composeExchange } from './exchanges/compose.ts';
import { terminalExchange } from './exchanges/terminal.ts';
import { makeSubject } from './stream/sources/make-subject.ts';
import type { Source } from './stream/types.ts';
import { pipe } from './stream/pipe.ts';
import { filter } from './stream/operators/filter.ts';
import { subscribe } from './stream/sinks/subscribe.ts';

export type QueryOptions<TVariables> = {
  variables?: TVariables;
  signal?: AbortSignal;
};

export type MutationOptions<TVariables> = {
  variables?: TVariables;
  signal?: AbortSignal;
};

export type SubscriptionOptions<TVariables> = {
  variables?: TVariables;
  signal?: AbortSignal;
};

export type ClientOptions = {
  exchanges: Exchange[];
};

export type Observable<T> = {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (error: Error) => void;
    complete?: () => void;
  }): {
    unsubscribe: () => void;
  };
};

export class Client {
  private operations$: ReturnType<typeof makeSubject<Operation>>;
  private results$: Source<OperationResult>;
  private unsubscribe?: () => void;

  constructor(config: ClientOptions) {
    this.operations$ = makeSubject<Operation>();

    const exchange = composeExchange({
      exchanges: [...config.exchanges, terminalExchange()]
    });
    const noop = (ops: Source<Operation>) => ops as unknown as Source<OperationResult>;
    this.results$ = exchange(noop)(this.operations$.source);

    this.unsubscribe = pipe(
      this.results$,
      subscribe({
        next: () => {},
      }),
    );
  }

  private createOperationKey(artifact: Artifact, variables: unknown): string {
    const variablesKey = JSON.stringify(variables ?? {});
    return `${artifact.name}:${variablesKey}`;
  }

  private executeOperation<T>(
    kind: OperationKind,
    artifact: Artifact,
    variables?: unknown,
    signal?: AbortSignal,
  ): Promise<{ data: T; errors?: OperationResult['errors'] }> {
    return new Promise((resolve, reject) => {
      const key = this.createOperationKey(artifact, variables ?? {});

      const operation: Operation = {
        variant: 'request',
        key,
        metadata: {},
        artifact: artifact as Artifact<OperationKind>,
        variables: variables ?? {},
      };

      let hasResult = false;
      const cleanup = pipe(
        this.results$,
        filter((result) => result.operation.key === key),
        subscribe({
          next: (result: OperationResult) => {
            hasResult = true;
            cleanup();
            resolve({ data: result.data as T, errors: result.errors });
          },
        }),
      );

      signal?.addEventListener('abort', () => {
        if (!hasResult) {
          cleanup();
          this.operations$.next({ variant: 'teardown', key, metadata: {} });
          reject(new Error('Operation aborted'));
        }
      });

      this.operations$.next(operation);
    });
  }

  async query<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: QueryOptions<TVariables>,
  ): Promise<{ data: TResult; errors?: OperationResult['errors'] }> {
    return this.executeOperation<TResult>('query', document, variables, options?.signal);
  }

  async mutate<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: MutationOptions<TVariables>,
  ): Promise<{ data: TResult; errors?: OperationResult['errors'] }> {
    return this.executeOperation<TResult>('mutation', document, variables, options?.signal);
  }

  subscription<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: SubscriptionOptions<TVariables>,
  ): Observable<{ data: TResult; errors?: OperationResult['errors'] }> {
    return {
      subscribe: (observer) => {
        const key = this.createOperationKey(document, variables ?? {});

        const operation: Operation = {
          variant: 'request',
          key,
          metadata: {},
          artifact: document as Artifact<'subscription'>,
          variables: variables ?? {},
        };

        const cleanup = pipe(
          this.results$,
          filter((result) => result.operation.key === key),
          subscribe({
            next: (result: OperationResult) => {
              if (observer.next) {
                observer.next({ data: result.data as TResult, errors: result.errors });
              }
            },
            complete: () => {
              if (observer.complete) {
                observer.complete();
              }
            },
          }),
        );

        options?.signal?.addEventListener('abort', () => {
          cleanup();
          this.operations$.next({ variant: 'teardown', key, metadata: {} });
        });

        this.operations$.next(operation);

        return {
          unsubscribe: () => {
            cleanup();
            this.operations$.next({ variant: 'teardown', key, metadata: {} });
          },
        };
      },
    };
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.operations$.complete();
  }
}

export const createClient = (config: ClientOptions): Client => {
  return new Client(config);
};
