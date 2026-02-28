import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import type { VariablesOf, DataOf, Artifact, SubscriptionOptions, OperationResult } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-provider.tsx';

export type Subscription<T extends Artifact<'subscription'>> =
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

export type CreateSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const createSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends Record<string, never>
    ? [undefined?, Accessor<CreateSubscriptionOptions<T>>?]
    : [Accessor<VariablesOf<T>>, Accessor<CreateSubscriptionOptions<T>>?]
): Subscription<T> => {
  const client = useClient();

  const [data, setData] = createSignal<DataOf<T> | undefined>();
  const [loading, setLoading] = createSignal<boolean>(!options?.()?.skip);
  const [error, setError] = createSignal<AggregatedError | undefined>();
  const [metadata, setMetadata] = createSignal<OperationResult['metadata']>();

  createEffect(() => {
    if (options?.()?.skip) {
      return;
    }

    setLoading(true);
    setError(undefined);

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, typeof variables === 'function' ? variables() : variables, options?.()),
      subscribe({
        next: (result) => {
          setMetadata(result.metadata);
          if (result.errors && result.errors.length > 0) {
            const err = new AggregatedError(result.errors);

            setError(err);
            setLoading(false);

            options?.()?.onError?.(err);
          } else {
            const resultData = result.data as DataOf<T>;

            setData(() => resultData);
            setLoading(false);
            setError(undefined);

            options?.()?.onData?.(resultData);
          }
        },
      }),
    );

    onCleanup(() => {
      unsubscribe();
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
    get metadata() {
      return metadata();
    },
  } as Subscription<T>;
};
