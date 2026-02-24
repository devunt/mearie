import { createSignal, createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import type { Artifact, VariablesOf, DataOf, QueryOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type CreateQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
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
      error: AggregatedError;
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: DataOf<T>;
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
      data: DataOf<T>;
      loading: false;
      error: AggregatedError;
      refetch: () => void;
    };

type CreateQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: Accessor<VariablesOf<T>> | undefined,
    options: Accessor<CreateQueryOptions<T> & { initialData: DataOf<T> }>,
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, Accessor<CreateQueryOptions<T>>?]
      : [Accessor<VariablesOf<T>>, Accessor<CreateQueryOptions<T>>?]
  ): Query<T>;
};

export const createQuery: CreateQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: Accessor<VariablesOf<T>>,
  options?: Accessor<CreateQueryOptions<T>>,
): Query<T> => {
  const client = useClient();

  const initialOpts = options?.();
  const [data, setData] = createSignal<DataOf<T> | undefined>(initialOpts?.initialData);
  const [loading, setLoading] = createSignal<boolean>(!initialOpts?.skip && !initialOpts?.initialData);
  const [error, setError] = createSignal<AggregatedError | undefined>();

  let unsubscribe: (() => void) | null = null;
  let initialized = false;

  const execute = () => {
    unsubscribe?.();

    if (options?.()?.skip) {
      return;
    }

    if (!initialized && initialOpts?.initialData) {
      initialized = true;
      return;
    }
    initialized = true;

    setLoading(true);
    setError(undefined);

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, typeof variables === 'function' ? variables() : variables, options?.()),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            setError(new AggregatedError(result.errors));
            setLoading(false);
          } else {
            setData(() => result.data as DataOf<T>);
            setLoading(false);
            setError(undefined);
          }
        },
      }),
    );
  };

  const refetch = () => {
    untrack(execute);
  };

  createEffect(() => {
    execute();

    onCleanup(() => {
      unsubscribe?.();
    });
  });

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
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
