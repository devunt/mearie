import { ref, watchEffect, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { VariablesOf, DataOf, Artifact, SubscriptionOptions } from '@mearie/core';
import { AggregatedError } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type Subscription<T extends Artifact<'subscription'>> =
  | {
      data: Ref<undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<undefined>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
    };

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, MaybeRefOrGetter<UseSubscriptionOptions<T>>?]
    : [MaybeRefOrGetter<VariablesOf<T>>, MaybeRefOrGetter<UseSubscriptionOptions<T>>?]
): Subscription<T> => {
  const client = useClient();

  const data = ref<DataOf<T> | undefined>(undefined);
  const loading = ref<boolean>(!toValue(options)?.skip);
  const error = ref<AggregatedError | undefined>(undefined);

  let unsubscribe: (() => void) | null = null;

  const execute = () => {
    unsubscribe?.();

    if (toValue(options)?.skip) {
      return;
    }

    loading.value = true;
    error.value = undefined;

    unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, toValue(variables), toValue(options)),
      subscribe({
        next: (result) => {
          if (result.errors && result.errors.length > 0) {
            const err = new AggregatedError(result.errors);

            error.value = err;
            loading.value = false;

            toValue(options)?.onError?.(err);
          } else {
            const resultData = result.data as DataOf<T>;

            data.value = resultData;
            loading.value = false;

            toValue(options)?.onData?.(resultData);
          }
        },
      }),
    );
  };

  watchEffect((onCleanup) => {
    execute();

    onCleanup(() => {
      unsubscribe?.();
    });
  });

  return {
    data,
    loading,
    error,
  } as Subscription<T>;
};
