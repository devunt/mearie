import { useCallback, useReducer } from 'react';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';
import { useClient } from './client-provider.tsx';

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

type MutationState<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
};

type MutationAction<T> = { type: 'loading' } | { type: 'success'; data: T } | { type: 'error'; error: Error };

const mutationReducer = <T>(state: MutationState<T>, action: MutationAction<T>): MutationState<T> => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: undefined };
    case 'success':
      return { data: action.data, loading: false, error: undefined };
    case 'error':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
};

export const useMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = useClient();
  const [state, dispatch] = useReducer(mutationReducer<DataOf<T>>, {
    data: undefined,
    loading: false,
    error: undefined,
  });

  const mutate = useCallback(
    async (
      ...[variables, options]: VariablesOf<T> extends undefined
        ? [undefined?, UseMutationOptions?]
        : [VariablesOf<T>, UseMutationOptions?]
    ): Promise<DataOf<T>> => {
      const { skip = false } = options ?? {};

      if (skip) {
        throw new Error('Mutation is skipped');
      }

      dispatch({ type: 'loading' });

      try {
        const result = await client.mutate<DataOf<T>, VariablesOf<T>>(mutation, variables);

        if (result.errors && result.errors.length > 0) {
          const error = new Error(result.errors[0]?.message ?? 'GraphQL error');
          dispatch({ type: 'error', error });
          throw error;
        }

        dispatch({ type: 'success', data: result.data });
        return result.data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        dispatch({ type: 'error', error: err });
        throw err;
      }
    },
    [client, mutation],
  );

  return [
    mutate as (
      ...[variables, options]: VariablesOf<T> extends undefined
        ? [undefined?, UseMutationOptions?]
        : [VariablesOf<T>, UseMutationOptions?]
    ) => Promise<DataOf<T>>,
    {
      data: state.data as DataOf<T> | undefined,
      loading: state.loading,
      error: state.error,
    } as MutationResult<T>,
  ];
};
