import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artifact, Client, DataOf, OperationResult, QueryOptions, SchemaMeta, VariablesOf } from '@mearie/core';
import { AggregatedError, stringify, applyPatchesImmutable } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type UseQueryOptions<T extends Artifact<'query'> = Artifact<'query'>> = QueryOptions<T> & {
  skip?: boolean;
  suspense?: boolean;
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

type UseQueryFn = {
  <T extends Artifact<'query'>>(
    query: T,
    variables: VariablesOf<T> | undefined,
    options: UseQueryOptions<T> & { suspense: true; skip?: false },
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    variables: VariablesOf<T> | undefined,
    options: UseQueryOptions<T> & { initialData: DataOf<T> },
  ): DefinedQuery<T>;
  <T extends Artifact<'query'>>(
    query: T,
    ...[variables, options]: VariablesOf<T> extends Record<string, never>
      ? [undefined?, UseQueryOptions<T>?]
      : [VariablesOf<T>, UseQueryOptions<T>?]
  ): Query<T>;
};

type SuspenseQueryResource<T> = {
  status: 'pending' | 'success' | 'error';
  promise: Promise<void>;
  data: T | undefined;
  error: Error | undefined;
  result: OperationResult | undefined;
  active: boolean;
  subscribe: (listener: (result: OperationResult) => void) => () => void;
};

const suspenseQueryCache = new WeakMap<Client<SchemaMeta>, Map<string, SuspenseQueryResource<unknown>>>();

const getSuspenseQueryKey = <T extends Artifact<'query'>>(
  query: T,
  variables: VariablesOf<T> | undefined,
  options: UseQueryOptions<T> | undefined,
): string => {
  return stringify([query, variables, options?.metadata]);
};

const getSuspenseQueryResource = <T extends Artifact<'query'>>(
  client: Client<SchemaMeta>,
  query: T,
  variables: VariablesOf<T> | undefined,
  options: UseQueryOptions<T> | undefined,
  key: string,
): SuspenseQueryResource<DataOf<T>> => {
  let clientCache = suspenseQueryCache.get(client);
  if (!clientCache) {
    clientCache = new Map();
    suspenseQueryCache.set(client, clientCache);
  }

  const cached = clientCache.get(key);
  if (cached) {
    return cached as SuspenseQueryResource<DataOf<T>>;
  }

  const queryOptions: QueryOptions<T> = {
    metadata: options?.metadata,
    signal: options?.signal,
  };

  const listeners = new Set<(result: OperationResult) => void>();
  let cleanup: (() => void) | undefined;
  let unusedCleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveFirstResult: () => void;

  const scheduleUnusedCleanup = (): void => {
    if (unusedCleanupTimer) return;

    unusedCleanupTimer = setTimeout(() => {
      unusedCleanupTimer = undefined;
      if (listeners.size > 0) return;

      cleanup?.();
      cleanup = undefined;
      resource.active = false;
      clientCache.delete(key);
    }, 0);
  };

  const resource: SuspenseQueryResource<DataOf<T>> = {
    status: 'pending',
    promise: new Promise((resolve) => {
      resolveFirstResult = resolve;
    }),
    data: undefined,
    error: undefined,
    result: undefined,
    active: true,
    subscribe: (listener) => {
      if (unusedCleanupTimer) {
        clearTimeout(unusedCleanupTimer);
        unusedCleanupTimer = undefined;
      }

      if (resource.result) {
        listener(resource.result);
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          cleanup?.();
          cleanup = undefined;
          resource.active = false;
        }
      };
    },
  };

  cleanup = pipe(
    // @ts-expect-error - conditional signature makes this hard to type correctly
    client.executeQuery(query, variables, queryOptions),
    subscribe({
      next: (result) => {
        resource.result = result;

        if (resource.status === 'pending') {
          if (result.errors && result.errors.length > 0) {
            resource.status = 'error';
            resource.error = new AggregatedError(result.errors);
            cleanup?.();
            cleanup = undefined;
            resource.active = false;
          } else {
            resource.status = 'success';
            const patches = result.metadata?.cache?.patches;
            resource.data = patches ? applyPatchesImmutable(resource.data, patches)! : (result.data as DataOf<T>);
          }

          resolveFirstResult();
          scheduleUnusedCleanup();
        } else if (!result.errors || result.errors.length === 0) {
          const patches = result.metadata?.cache?.patches;
          resource.data = patches ? applyPatchesImmutable(resource.data, patches)! : (result.data as DataOf<T>);
        }

        for (const listener of listeners) {
          listener(result);
        }
      },
      complete: () => {
        if (resource.status === 'pending') {
          resource.status = 'error';
          resource.error = new Error('Query completed without emitting a result');
          resolveFirstResult();
          scheduleUnusedCleanup();
        }
        resource.active = false;
      },
    }),
  );

  clientCache.set(key, resource);
  return resource;
};

const deleteSuspenseQueryResource = (client: Client<SchemaMeta>, key: string): void => {
  suspenseQueryCache.get(client)?.delete(key);
};

const readSuspenseQueryResource = <T>(resource: SuspenseQueryResource<T>, onError?: () => void): T => {
  switch (resource.status) {
    case 'pending': {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense expects pending promises to be thrown during render.
      throw resource.promise;
    }
    case 'error': {
      if (onError) {
        queueMicrotask(onError);
      }
      throw resource.error!;
    }
    case 'success': {
      return resource.data!;
    }
  }
};

const applyQueryResult = <T extends Artifact<'query'>>(
  result: OperationResult,
  setMetadata: (metadata: OperationResult['metadata']) => void,
  setError: (error: AggregatedError | undefined) => void,
  setLoading: (loading: boolean) => void,
  setData: (updater: DataOf<T> | ((prev: DataOf<T> | undefined) => DataOf<T>)) => void,
): void => {
  setMetadata(result.metadata);
  if (result.errors && result.errors.length > 0) {
    setError(new AggregatedError(result.errors));
    setLoading(false);
  } else {
    const patches = result.metadata?.cache?.patches;
    if (patches) {
      setData((prev) => applyPatchesImmutable(prev, patches)!);
    } else {
      setData(result.data as DataOf<T>);
    }
    setLoading(false);
    setError(undefined);
  }
};

export const useQuery: UseQueryFn = (<T extends Artifact<'query'>>(
  query: T,
  variables?: VariablesOf<T>,
  options?: UseQueryOptions<T>,
): Query<T> => {
  const client = useClient();
  const suspenseKey =
    options?.suspense && !options.skip && options.initialData === undefined
      ? getSuspenseQueryKey(query, variables, options)
      : undefined;
  const suspenseResource =
    suspenseKey === undefined ? undefined : getSuspenseQueryResource(client, query, variables, options, suspenseKey);
  const suspenseData =
    suspenseKey === undefined
      ? undefined
      : readSuspenseQueryResource(suspenseResource!, () => deleteSuspenseQueryResource(client, suspenseKey));
  const hasInitialData = options?.initialData !== undefined || suspenseData !== undefined;

  const [data, setData] = useState<DataOf<T> | undefined>(suspenseData ?? options?.initialData);
  const [loading, setLoading] = useState(!options?.skip && !hasInitialData);
  const [error, setError] = useState<AggregatedError | undefined>();
  const [metadata, setMetadata] = useState<OperationResult['metadata']>();

  const unsubscribe = useRef<(() => void) | null>(null);
  const initialized = useRef(false);
  const stableVariables = useMemo(() => stringify(variables), [variables]);
  const stableOptions = useMemo(() => options, [options?.skip]);
  const activeSuspenseKey = useRef(suspenseKey);
  const activeSuspenseResource = useRef<SuspenseQueryResource<DataOf<T>> | undefined>(suspenseResource);

  const handleResult = useCallback((result: OperationResult) => {
    applyQueryResult<T>(result, setMetadata, setError, setLoading, setData);
  }, []);

  const execute = useCallback(
    (force = false) => {
      unsubscribe.current?.();

      if (!force && stableOptions?.skip) {
        setLoading(false);
        return;
      }

      if (initialized.current || !hasInitialData) {
        setLoading(true);
      }

      initialized.current = true;
      setError(undefined);

      unsubscribe.current = pipe(
        // @ts-expect-error - conditional signature makes this hard to type correctly
        client.executeQuery(query, variables, stableOptions),
        subscribe({
          next: handleResult,
        }),
      );
    },
    [client, query, stableVariables, stableOptions, hasInitialData, handleResult],
  );

  const refetch = useCallback(() => execute(true), [execute]);

  useEffect(() => {
    if (suspenseKey !== activeSuspenseKey.current) {
      activeSuspenseKey.current = suspenseKey;
      activeSuspenseResource.current = suspenseResource;
      initialized.current = false;
      setData(suspenseData);
      setLoading(false);
      setError(undefined);
    }

    if (suspenseResource?.active && suspenseResource === activeSuspenseResource.current && !initialized.current) {
      initialized.current = true;
      setError(undefined);
      setLoading(false);
      unsubscribe.current = suspenseResource.subscribe(handleResult);
      return () => unsubscribe.current?.();
    }

    execute();
    return () => unsubscribe.current?.();
  }, [execute, suspenseKey, suspenseData, suspenseResource, handleResult]);

  return {
    data: suspenseKey === activeSuspenseKey.current ? data : suspenseData,
    loading,
    error,
    metadata,
    refetch,
  } as Query<T>;
}) as unknown as UseQueryFn;
