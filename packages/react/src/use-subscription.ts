import type { VariablesOf, DataOf, Artifact } from '@mearie/core';

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
      error: Error;
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
    : [VariablesOf<T>, UseSubscriptionOptions<T>?]
): Subscription<T> => {
  return { data: undefined, loading: true, error: undefined };
};
