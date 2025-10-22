import type { Artifact, OperationKind, VariablesOf } from '@mearie/shared';
import type { Exchange, Operation, OperationResult } from './exchange.ts';
import { composeExchange } from './exchanges/compose.ts';
import { terminalExchange } from './exchanges/terminal.ts';
import { makeSubject, type Subject } from './stream/sources/make-subject.ts';
import type { Source } from './stream/types.ts';
import { pipe } from './stream/pipe.ts';
import { filter } from './stream/operators/filter.ts';
import { publish } from './stream/index.ts';

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type QueryOptions = {};
export type MutationOptions = {};
export type SubscriptionOptions = {};
/* eslint-enable @typescript-eslint/no-empty-object-type */

export type ClientOptions = {
  exchanges: Exchange[];
};

/**
 *
 */
export class Client {
  private operations$: Subject<Operation>;
  private results$: Source<OperationResult>;

  constructor(config: ClientOptions) {
    const exchange = composeExchange({
      exchanges: [...config.exchanges, terminalExchange()],
    });

    this.operations$ = makeSubject<Operation>();
    this.results$ = exchange((ops$) => ops$ as unknown as Source<OperationResult>)(this.operations$.source);

    pipe(this.results$, publish);
  }

  private createOperationKey(artifact: Artifact, variables: unknown): string {
    const variablesKey = JSON.stringify(variables ?? {});
    return `${artifact.name}:${variablesKey}`;
  }

  createOperation(artifact: Artifact, variables?: unknown): Operation {
    const key = this.createOperationKey(artifact, variables ?? {});

    return {
      variant: 'request',
      key,
      metadata: {},
      artifact: artifact as Artifact<OperationKind>,
      variables: variables ?? {},
    };
  }

  executeOperation(operation: Operation): Source<OperationResult> {
    this.operations$.next(operation);

    return pipe(
      this.results$,
      filter((result) => result.operation.key === operation.key),
    );
  }

  executeQuery<T extends Artifact<'query'>>(
    artifact: T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...[variables, options]: VariablesOf<T> extends undefined
      ? [undefined?, QueryOptions?]
      : [VariablesOf<T>, QueryOptions?]
  ): Source<OperationResult> {
    const operation = this.createOperation(artifact, variables);
    return this.executeOperation(operation);
  }

  executeMutation<T extends Artifact<'mutation'>>(
    artifact: T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...[variables, options]: VariablesOf<T> extends undefined
      ? [undefined?, MutationOptions?]
      : [VariablesOf<T>, MutationOptions?]
  ): Source<OperationResult> {
    const operation = this.createOperation(artifact, variables);
    return this.executeOperation(operation);
  }

  executeSubscription<T extends Artifact<'subscription'>>(
    artifact: T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...[variables, options]: VariablesOf<T> extends undefined
      ? [undefined?, SubscriptionOptions?]
      : [VariablesOf<T>, SubscriptionOptions?]
  ): Source<OperationResult> {
    const operation = this.createOperation(artifact, variables);
    return this.executeOperation(operation);
  }

  dispose(): void {
    this.operations$.complete();
  }
}

export const createClient = (config: ClientOptions): Client => {
  return new Client(config);
};
