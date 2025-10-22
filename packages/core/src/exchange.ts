import type { Artifact, ArtifactKind, VariablesOf } from '@mearie/shared';
import type { Source } from './stream/index.ts';
import type { OperationError } from './errors.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OperationMetadataMap {}

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

export type ExchangeIO = (operations: Source<Operation>) => Source<OperationResult>;

export type Exchange = (forward: ExchangeIO) => ExchangeIO;

/**
 * Creates a new operation with updated metadata, keeping the operation immutable.
 * @param operation - The original operation.
 * @param metadata - Additional metadata to merge into the new operation.
 * @returns A new operation with the merged metadata.
 */
export const makeOperation = (
  operation: Operation,
  metadata?: Partial<OperationMetadataMap> & Record<string, unknown>,
): Operation => {
  return {
    ...operation,
    metadata: {
      ...operation.metadata,
      ...metadata,
    },
  };
};
