import type { VariablesOf, DataOf, Artifact, SubscriptionOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { getClient } from './client-context.svelte.ts';

export type Subscription<T extends Artifact<'subscription'>> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: undefined;
    }
  | {
      data: DataOf<T> | undefined;
      loading: false;
      error: AggregatedError;
    };

export type CreateSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const createSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, (() => CreateSubscriptionOptions<T>)?]
    : [() => VariablesOf<T>, (() => CreateSubscriptionOptions<T>)?]
): Subscription<T> => {
  const client = getClient();

  let data = $state<DataOf<T> | undefined>();
  let loading = $state<boolean>(!options?.().skip);
  let error = $state<AggregatedError | undefined>();

  $effect(() => {
    if (options?.().skip) {
      return;
    }

    loading = true;
    error = undefined;

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, typeof variables === 'function' ? variables() : undefined, options?.()),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            const err = new AggregatedError(result.errors);

            error = err;
            loading = false;

            options?.().onError?.(err);
          } else {
            const resultData = result.data as DataOf<T>;

            data = resultData;
            loading = false;

            options?.().onData?.(resultData);
          }
        },
      }),
    );

    return () => {
      unsubscribe();
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
  } as Subscription<T>;
};
