import { untrack } from 'svelte';
import type { Artifact, VariablesOf, DataOf, QueryOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

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
    variables: (() => VariablesOf<T>) | undefined,
    options: () => CreateQueryOptions<T> & { initialData: DataOf<T> },
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, (() => CreateQueryOptions<T>)?]
      : [() => VariablesOf<T>, (() => CreateQueryOptions<T>)?]
  ): Query<T>;
};

export const createQuery: CreateQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: (() => VariablesOf<T>)  ,
  options?: (() => CreateQueryOptions<T>)  ,
): Query<T> => {
  const client = getClient();

  const initialOpts = options?.();
  let data = $state<DataOf<T> | undefined>(initialOpts?.initialData);
  let loading = $state<boolean>(!initialOpts?.skip && !initialOpts?.initialData);
  let error = $state<AggregatedError | undefined>();

  let unsubscribe: (() => void) | null = null;
  let initialized = false;

  const execute = () => {
    unsubscribe?.();

    if (options?.().skip) {
      return;
    }

    if (!initialized && initialOpts?.initialData) {
      initialized = true;
      return;
    }
    initialized = true;

    loading = true;
    error = undefined;

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, typeof variables === 'function' ? variables() : undefined, options?.()),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            error = new AggregatedError(result.errors);
            loading = false;
          } else {
            data = result.data as DataOf<T>;
            loading = false;
          }
        },
      }),
    );
  };

  const refetch = () => {
    untrack(execute);
  };

  $effect(() => {
    execute();

    return () => {
      unsubscribe?.();
    };
  });

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
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
