import type { Artifact, ArtifactKind, OperationKind, VariablesOf, FragmentRefs, SchemaMeta } from '@mearie/shared';
import type { Exchange, Operation, OperationResult } from './exchange.ts';
import type { ScalarsConfig } from './scalars.ts';
import { composeExchange } from './exchanges/compose.ts';
import { fragmentExchange } from './exchanges/fragment.ts';
import { scalarExchange } from './exchanges/scalar.ts';
import { terminalExchange } from './exchanges/terminal.ts';
import { makeSubject, type Subject } from './stream/sources/make-subject.ts';
import type { Source } from './stream/types.ts';
import { pipe } from './stream/pipe.ts';
import { filter } from './stream/operators/filter.ts';
import { initialize } from './stream/operators/initialize.ts';
import { share } from './stream/operators/share.ts';
import { finalize } from './stream/operators/finalize.ts';
import { never } from './stream/sources/never.ts';

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type QueryOptions = {};
export type MutationOptions = {};
export type SubscriptionOptions = {};
export type FragmentOptions = {};
/* eslint-enable @typescript-eslint/no-empty-object-type */

export type ClientOptions = {
  schema: SchemaMeta;
  exchanges: Exchange[];
  scalars?: ScalarsConfig;
};

export class Client {
  #schema: SchemaMeta;
  #scalars?: ScalarsConfig;
  private operations$: Subject<Operation>;
  private results$: Source<OperationResult>;

  constructor(config: ClientOptions) {
    this.#schema = config.schema;
    this.#scalars = config.scalars;

    const exchange = composeExchange({
      exchanges: [scalarExchange(), ...config.exchanges, fragmentExchange(), terminalExchange()],
    });

    this.operations$ = makeSubject<Operation>();
    this.results$ = exchange({ forward: never, client: this })(this.operations$.source);
  }

  get schema(): SchemaMeta {
    return this.#schema;
  }

  get scalars(): ScalarsConfig | undefined {
    return this.#scalars;
  }

  private createOperationKey(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  createOperation(artifact: Artifact, variables?: unknown): Operation {
    const key = this.createOperationKey();

    return {
      variant: 'request',
      key,
      metadata: {},
      artifact: artifact as Artifact<OperationKind>,
      variables: variables ?? {},
    };
  }

  executeOperation(operation: Operation): Source<OperationResult> {
    return pipe(
      this.results$,
      initialize(() => this.operations$.next(operation)),
      filter((result) => result.operation.key === operation.key),
      finalize(() => this.operations$.next({ variant: 'teardown', key: operation.key, metadata: {} })),
      share(),
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

  executeFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<T['name']>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: FragmentOptions,
  ): Source<OperationResult> {
    const key = this.createOperationKey();

    const operation: Operation = {
      variant: 'request',
      key,
      metadata: {
        fragmentRef,
      },
      artifact: artifact as Artifact<ArtifactKind>,
      variables: {},
    };

    return this.executeOperation(operation);
  }

  dispose(): void {
    this.operations$.complete();
  }
}

export const createClient = (config: ClientOptions): Client => {
  return new Client(config);
};
