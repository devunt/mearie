import type { VariablesOf, DataOf, Artifact, MutationOptions, OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, take, collect } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

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

export type CreateMutationOptions = MutationOptions;

export type Mutation<T extends Artifact<'mutation'>> = [
  (
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, CreateMutationOptions?]
      : [VariablesOf<T>, CreateMutationOptions?]
  ) => Promise<DataOf<T>>,
  MutationResult<T>,
];

export const createMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = getClient();

  let data = $state<DataOf<T> | undefined>();
  let loading = $state<boolean>(false);
  let error = $state<AggregatedError | undefined>();
  let metadata = $state<OperationResult['metadata']>();

  const execute = async (variables?: VariablesOf<T>, options?: CreateMutationOptions): Promise<DataOf<T>> => {
    loading = true;
    error = undefined;
    metadata = undefined;

    try {
      const result = await pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeMutation(mutation, variables, options),
        take(1),
        collect,
      );

      metadata = result.metadata;

      if (result.errors && result.errors.length > 0) {
        const err = new AggregatedError(result.errors);

        error = err;
        loading = false;

        throw err;
      }

      data = result.data as DataOf<T>;
      loading = false;

      return result.data as DataOf<T>;
    } catch (err) {
      if (err instanceof AggregatedError) {
        error = err;
      }

      loading = false;

      throw err;
    }
  };

  return [
    execute,
    {
      get data() {
        return data;
      },
      get loading() {
        return loading;
      },
      get error() {
        return error;
      },
      get metadata() {
        return metadata;
      },
    },
  ] as Mutation<T>;
};
