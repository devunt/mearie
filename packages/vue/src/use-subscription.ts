import { ref, type Ref, type MaybeRefOrGetter } from 'vue';
import type { VariablesOf, DataOf, Artifact } from '@mearie/core';

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
      error: Ref<Error>;
    };

export type UseSubscriptionOptions<T extends Artifact<'subscription'>> = {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: Error) => void;
};

export const useSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, UseSubscriptionOptions<T>?]
    : [MaybeRefOrGetter<VariablesOf<T>>, UseSubscriptionOptions<T>?]
): Subscription<T> => {
  const data = ref<DataOf<T> | undefined>(undefined);
  const loading = ref(true);
  const error = ref<Error | undefined>(undefined);

  return {
    data,
    loading,
    error,
  } as Subscription<T>;
};
