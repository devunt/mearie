import { untrack } from 'svelte';
import type { Artifact, VariablesOf, DataOf, QueryOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

export type CreateQueryOptions = QueryOptions & {
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

export const createQuery = <T extends Artifact<'query'>>(
  query: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, (() => CreateQueryOptions)?]
    : [() => VariablesOf<T>, (() => CreateQueryOptions)?]
): Query<T> => {
  const client = getClient();

  let data = $state<DataOf<T> | undefined>();
  let loading = $state<boolean>(!options?.().skip);
  let error = $state<AggregatedError | undefined>();

  let unsubscribe: (() => void) | null = null;

  const execute = () => {
    unsubscribe?.();

    if (options?.().skip) {
      return;
    }

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
};
