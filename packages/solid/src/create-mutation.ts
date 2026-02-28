import { createSignal } from 'solid-js';
import type { VariablesOf, DataOf, Artifact, MutationOptions, OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, take, collect } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type MutationResult<T extends Artifact<'mutation'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      metadata: OperationResult['metadata'];
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
    };

export type CreateMutationOptions<T extends Artifact<'mutation'> = Artifact<'mutation'>> = MutationOptions<T>;

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, CreateMutationOptions<T>?]
      : [VariablesOf<T>, CreateMutationOptions<T>?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const createMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = useClient();

  const [data, setData] = createSignal<DataOf<T> | undefined>();
  const [loading, setLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<AggregatedError | undefined>();
  const [metadata, setMetadata] = createSignal<OperationResult['metadata']>();

  const execute = async (variables?: VariablesOf<T>, options?: CreateMutationOptions<T>): Promise<DataOf<T>> => {
    setLoading(true);
    setError(undefined);
    setMetadata(undefined);

    try {
      const result = await pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeMutation(mutation, variables, options),
        take(1),
        collect,
      );

      setMetadata(result.metadata);

      if (result.errors && result.errors.length > 0) {
        const err = new AggregatedError(result.errors);

        setError(err);
        setLoading(false);

        throw err;
      }

      setData(() => result.data as DataOf<T>);
      setLoading(false);

      return result.data as DataOf<T>;
    } catch (err) {
      if (err instanceof AggregatedError) {
        setError(err);
      }

      setLoading(false);

      throw err;
    }
  };

  return [
    execute,
    {
      get data() {
        return data();
      },
      get loading() {
        return loading();
      },
      get error() {
        return error();
      },
      get metadata() {
        return metadata();
      },
    },
  ] as Mutation<T>;
};
