import { createSignal } from 'solid-js';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';

export type CreateMutationOptions = {
  skip?: boolean;
};

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
      error: Error;
      mutate: (
        ...[variables, options]: VariablesOf<T> extends undefined
          ? [undefined?, CreateMutationOptions?]
          : [VariablesOf<T>, CreateMutationOptions?]
      ) => Promise<DataOf<T>>;
    };

export const createMutation = <T extends Artifact<'mutation'>>(mutation: T): Mutation<T> => {
  const [data] = createSignal<DataOf<T>>();
  const [loading] = createSignal(false);
  const [error] = createSignal<Error>();

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
    mutate: async () => ({}) as DataOf<T>,
  } as Mutation<T>;
};
