import { computed, reactive, shallowRef, toValue, watchEffect, type Ref, type MaybeRefOrGetter } from 'vue';
import type {
  VariablesOf,
  DataOf,
  Artifact,
  SubscriptionOptions,
  OperationResult,
  ObserverState,
  AggregatedError,
} from '@mearie/core';
import { computeObserverKey, deriveObserverView, initObserverState, reduceObserverResult } from '@mearie/core';
import { pipe, subscribe } from '@mearie/core/stream';
import { useClient } from './client-plugin.ts';

export type Subscription<T extends Artifact<'subscription'>> =
  | {
      data: Ref<undefined>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<true>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<undefined>;
      metadata: Ref<OperationResult['metadata']>;
    }
  | {
      data: Ref<DataOf<T> | undefined>;
      previousData: Ref<DataOf<T> | undefined>;
      loading: Ref<false>;
      error: Ref<AggregatedError>;
      metadata: Ref<OperationResult['metadata']>;
    };

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = SubscriptionOptions & {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: AggregatedError) => void;
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends Record<string, never>
    ? [undefined?, MaybeRefOrGetter<UseSubscriptionOptions<T>>?]
    : [MaybeRefOrGetter<VariablesOf<T>>, MaybeRefOrGetter<UseSubscriptionOptions<T>>?]
): Subscription<T> => {
  const client = useClient();

  const wrap = (data: unknown) => reactive(data as object) as DataOf<T>;

  // `raw` mirrors `state` for reads inside `watchEffect`: vue has no `untrack`, so reading `state.value`
  // there would make the effect depend on its own writes.
  let raw = initObserverState<DataOf<T>>();
  const state = shallowRef<ObserverState<DataOf<T>>>(raw);
  const commit = (next: ObserverState<DataOf<T>>) => {
    raw = next;
    state.value = next;
  };

  const currentKey = computed(() => computeObserverKey(subscription, toValue(variables)));
  const skip = computed(() => toValue(options)?.skip ?? false);
  const view = computed(() => deriveObserverView(state.value, currentKey.value, skip.value));

  watchEffect((onCleanup) => {
    const key = currentKey.value;
    if (skip.value) return;

    const currentVariables = toValue(variables);
    const currentOptions = toValue(options);

    const unsubscribe = pipe(
      // @ts-expect-error - conditional signature makes this hard to type correctly
      client.executeSubscription(subscription, currentVariables, currentOptions),
      subscribe({
        next: (result) => {
          commit(reduceObserverResult<DataOf<T>>(raw, key, result, { mapData: wrap }));

          const emitted = raw.emission;
          const opts = toValue(options);
          if (emitted?.error) {
            opts?.onError?.(emitted.error);
          } else if (emitted?.key === key) {
            opts?.onData?.(emitted.data!);
          }
        },
      }),
    );

    onCleanup(() => {
      unsubscribe();
    });
  });

  return {
    data: computed(() => view.value.data),
    previousData: computed(() => view.value.previousData),
    loading: computed(() => view.value.loading),
    error: computed(() => view.value.error),
    metadata: computed(() => view.value.metadata),
  } as Subscription<T>;
};
