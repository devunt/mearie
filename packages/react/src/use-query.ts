import type { Artifact, DataOf, VariablesOf } from '@mearie/core';

export type Query<T extends Artifact<'query'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: Error;
      refetch: () => void;
    };

export type UseQueryOptions = {
  skip?: boolean;
};

export const useQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseQueryOptions?]
    : [VariablesOf<T>, UseQueryOptions?]
): Query<T> => {
  return {
    data: undefined,
    loading: true,
    error: undefined,
    refetch: () => {},
  };
};
