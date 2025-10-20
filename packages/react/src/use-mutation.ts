import type { VariablesOf, DataOf, Artifact } from '@mearie/core';

export type MutationResult<T extends Artifact<'mutation'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: Error;
    };

export type UseMutationOptions = {
  skip?: boolean;
};

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends undefined
      ? [undefined?, UseMutationOptions?]
      : [VariablesOf<T>, UseMutationOptions?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const useMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  return [async () => ({}) as DataOf<T>, { data: undefined, loading: false, error: undefined }];
};
