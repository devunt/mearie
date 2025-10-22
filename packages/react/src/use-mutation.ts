import { useCallback, useReducer, useRef } from 'react';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
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
      error: AggregatedError;
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
  error: AggregatedError | undefined;
};

type MutationAction<T> = { type: 'loading' } | { type: 'success'; data: T } | { type: 'error'; error: AggregatedError };

const mutationReducer = <T>(state: MutationState<T>, action: MutationAction<T>): MutationState<T> => {
  if (action.type === 'loading') {
    return { ...state, loading: true, error: undefined };
  } else if (action.type === 'success') {
    return { data: action.data, loading: false, error: undefined };
  } else if (action.type === 'error') {
    return { ...state, loading: false, error: action.error };
  } else {
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

  const subscriptionRef = useRef<(() => void) | null>(null);

  const executeMutation = useCallback(
    (variables?: VariablesOf<T>, skip?: boolean): Promise<DataOf<T>> => {
      if (skip) {
        throw new AggregatedError([], 'Mutation is skipped');
      }

      subscriptionRef.current?.();

      dispatch({ type: 'loading' });

      return new Promise((resolve, reject) => {
        const unsubscribe = pipe(
          // @ts-expect-error - conditional signature makes this hard to type correctly
          client.executeMutation(mutation, variables),
          subscribe({
            next: (result) => {
              if (result.errors && result.errors.length > 0) {
                const error = new AggregatedError(result.errors);
                dispatch({ type: 'error', error });
                reject(error);
              } else {
                dispatch({ type: 'success', data: result.data as DataOf<T> });
                resolve(result.data as DataOf<T>);
              }
              subscriptionRef.current = null;
            },
          }),
        );

        subscriptionRef.current = unsubscribe;
      });
    },
    [client, mutation],
  );

  const mutate = useCallback(
    (
      ...[variables, options]: VariablesOf<T> extends undefined
        ? [undefined?, UseMutationOptions?]
        : [VariablesOf<T>, UseMutationOptions?]
    ): Promise<DataOf<T>> => {
      const { skip = false } = options ?? {};
      return executeMutation(variables, skip);
    },
    [executeMutation],
  );

  return [
    mutate as (
      ...[variables, options]: VariablesOf<T> extends undefined
        ? [undefined?, UseMutationOptions?]
        : [VariablesOf<T>, UseMutationOptions?]
    ) => Promise<DataOf<T>>,
    {
      data: state.data,
      loading: state.loading,
      error: state.error,
    } as MutationResult<T>,
  ];
};
