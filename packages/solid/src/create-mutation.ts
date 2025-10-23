import { createSignal } from 'solid-js';
import type { VariablesOf, DataOf, Artifact, MutationOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, collect } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type CreateMutationOptions = MutationOptions;

export type Mutation<T extends Artifact<'mutation'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      mutate: (
        ...[variables, options]: VariablesOf<T> extends undefined
          ? [undefined?, CreateMutationOptions?]
          : [VariablesOf<T>, CreateMutationOptions?]
      ) => Promise<DataOf<T>>;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: undefined;
      mutate: (
        ...[variables, options]: VariablesOf<T> extends undefined
          ? [undefined?, CreateMutationOptions?]
          : [VariablesOf<T>, CreateMutationOptions?]
      ) => Promise<DataOf<T>>;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      mutate: (
        ...[variables, options]: VariablesOf<T> extends undefined
          ? [undefined?, CreateMutationOptions?]
          : [VariablesOf<T>, CreateMutationOptions?]
      ) => Promise<DataOf<T>>;
    };

export const createMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const client = useClient();

  const [data, setData] = createSignal<DataOf<T> | undefined>();
  const [loading, setLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<AggregatedError | undefined>();

  const execute = async (variables?: VariablesOf<T>, options?: CreateMutationOptions): Promise<DataOf<T>> => {
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

  return {
    get data() {
      return data();
    },
    get loading() {
      return loading();
    },
    get error() {
      return error();
    },
    mutate: execute,
  } as Mutation<T>;
};
