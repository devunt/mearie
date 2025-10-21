import type { Artifact, VariablesOf, DataOf } from '@mearie/core';

export type CreateQueryOptions = {
  skip?: boolean;
};

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

export const createQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, CreateQueryOptions?]
    : [() => VariablesOf<T>, CreateQueryOptions?]
): Query<T> => {
  const data = $state<DataOf<T> | undefined>();
  const loading = $state(true);
  const error = $state<Error | undefined>();

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    refetch: () => {},
  } as Query<T>;
};
