import type { Artifact, ArtifactKind, VariablesOf, SchemaMeta } from '@mearie/shared';
import type { Source } from './stream/index.ts';
import type { OperationError } from './errors.ts';
import type { Client } from './client.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OperationMetadataMap {}

export type OperationMetadata = {
  [K in keyof OperationMetadataMap]?: OperationMetadataMap[K];
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
  stale?: boolean;
};

export type ExchangeInput<TMeta extends SchemaMeta = SchemaMeta> = {
  forward: ExchangeIO;
  client: Client<TMeta>;
};

export type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExchangeExtensionMap {}

export type ExchangeResult<TName extends keyof ExchangeExtensionMap | (string & {}) = string> = {
  name: TName;
  io: ExchangeIO;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
} & (TName extends keyof ExchangeExtensionMap ? { extension: ExchangeExtensionMap[TName] } : {});

export type Exchange<TName extends keyof ExchangeExtensionMap | (string & {}) = string> = <
  TMeta extends SchemaMeta = SchemaMeta,
>(
  input: ExchangeInput<TMeta>,
) => ExchangeResult<TName>;
