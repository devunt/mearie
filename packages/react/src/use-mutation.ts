import { useCallback, useState } from 'react';
import type { VariablesOf, DataOf, Artifact, MutationOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, collect } from '@mearie/core/stream';
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

export type UseMutationOptions = MutationOptions;

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, UseMutationOptions?]
      : [VariablesOf<T>, UseMutationOptions?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const useMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = useClient();

  const [data, setData] = useState<DataOf<T> | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AggregatedError | undefined>();

  const execute = useCallback(
    async (variables?: VariablesOf<T>, options?: UseMutationOptions): Promise<DataOf<T>> => {
      setLoading(true);
      setError(undefined);

      try {
        const result = await pipe(
          // @ts-expect-error - conditional signature makes this hard to type correctly
          client.executeMutation(mutation, variables, options),
          collect,
        );

        if (result.errors && result.errors.length > 0) {
          const err = new AggregatedError(result.errors);

          setError(err);
          setLoading(false);

          throw err;
        }

        setData(result.data as DataOf<T>);
        setLoading(false);

        return result.data as DataOf<T>;
      } catch (err) {
        if (err instanceof AggregatedError) {
          setError(err);
        }

        setLoading(false);

        throw err;
      }
    },
    [client, mutation],
  );

  return [
    execute,
    {
      data,
      loading,
      error,
    },
  ] as Mutation<T>;
};
