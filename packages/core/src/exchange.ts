import type { Artifact, ArtifactKind, VariablesOf, SchemaMeta } from '@mearie/shared';
import type { Source } from './stream/index.ts';
import type { OperationError } from './errors.ts';
import type { Client } from './client.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
export interface OperationMetadataMap<T extends Artifact = Artifact> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OperationResultMetadataMap {}

export type OperationMetadata<T extends Artifact = Artifact> = {
  [K in keyof OperationMetadataMap<T>]?: OperationMetadataMap<T>[K];
} & Record<string, unknown>;

export type BaseOperation = {
  key: string;
  metadata: OperationMetadataMap & Record<string, unknown>;
};

export type RequestOperation<K extends ArtifactKind = ArtifactKind> = BaseOperation & {
  variant: 'request';
  artifact: Artifact<K>;
  variables: VariablesOf<Artifact<K>>;
};

export type TeardownOperation = BaseOperation & {
  variant: 'teardown';
};

export type Operation<K extends ArtifactKind = ArtifactKind> = RequestOperation<K> | TeardownOperation;

export type OperationResult = {
  operation: Operation;
  data?: unknown;
  errors?: readonly OperationError[];
  extensions?: Record<string, unknown>;
  metadata?: OperationResultMetadataMap & Record<string, unknown>;
};

export type ExchangeInput<TMeta extends SchemaMeta = SchemaMeta> = {
  forward: ExchangeIO;
  client: Client<TMeta>;
};

export type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
export interface ExchangeExtensionMap<TMeta extends SchemaMeta = SchemaMeta> {}

export type ExchangeResult<
  TName extends keyof ExchangeExtensionMap | (string & {}) = string,
  TMeta extends SchemaMeta = SchemaMeta,
> = {
  name: TName;
  io: ExchangeIO;
} & (TName extends keyof ExchangeExtensionMap<TMeta>
  ? { extension: ExchangeExtensionMap<TMeta>[TName] }
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {});

export type Exchange<TName extends keyof ExchangeExtensionMap | (string & {}) = string> = <
  TMeta extends SchemaMeta = SchemaMeta,
>(
  input: ExchangeInput<TMeta>,
) => ExchangeResult<TName, TMeta>;
