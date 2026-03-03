import { createSignal, createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import type { Artifact, VariablesOf, DataOf, QueryOptions, OperationResult } from '@mearie/core';
import { AggregatedError, applyPatchesMutable } from '@mearie/core';
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
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    };

export type DefinedQuery<T extends Artifact<'query'>> =
  | {
      data: DataOf<T>;
      loading: true;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: undefined;
      metadata: OperationResult['metadata'];
      refetch: () => void;
    }
  | {
      data: DataOf<T>;
      loading: false;
      error: AggregatedError;
      metadata: OperationResult['metadata'];
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
  const [data, setData] = createStore<{ value: DataOf<T> | undefined }>({
    value: initialOpts?.initialData,
  });
  const [loading, setLoading] = createSignal<boolean>(!initialOpts?.skip && !initialOpts?.initialData);
  const [error, setError] = createSignal<AggregatedError | undefined>();
  const [metadata, setMetadata] = createSignal<OperationResult['metadata']>();

  let unsubscribe: (() => void) | null = null;
  let initialized = false;

  const execute = (force = false) => {
    unsubscribe?.();

    if (!force && options?.()?.skip) {
      setLoading(false);
      return;
    }

    if (initialized || !initialOpts?.initialData) {
      setLoading(true);
    }

    initialized = true;
    setError(undefined);

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeQuery(query, typeof variables === 'function' ? variables() : variables, options?.()),
      subscribe({
        next: (result) => {
          setMetadata(result.metadata);
          if (result.errors && result.errors.length > 0) {
            setError(new AggregatedError(result.errors));
            setLoading(false);
          } else {
            const patches = result.metadata?.cache?.patches;
            if (patches) {
              setData(
                'value',
                produce((draft) => {
                  const root = applyPatchesMutable(draft, patches);
                  if (root !== undefined) return root;
                }),
              );
            } else {
              setData('value', reconcile(result.data as DataOf<T>));
            }
            setLoading(false);
            setError(undefined);
          }
        },
      }),
    );
  };

  const refetch = () => {
    untrack(() => execute(true));
  };

  createEffect(() => {
    execute();

    onCleanup(() => {
      unsubscribe?.();
    });
  });

  return {
    get data() {
      return data.value;
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
    refetch,
  } as Query<T>;
}) as unknown as CreateQueryFn;
