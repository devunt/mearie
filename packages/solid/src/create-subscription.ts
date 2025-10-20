import { createSignal, type Accessor } from 'solid-js';
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

export type CreateSubscriptionOptions<T extends Artifact<'subscription'>> = {
  skip?: boolean;
  onData?: (data: DataOf<T>) => void;
  onError?: (error: Error) => void;
};

export const createSubscription = <T extends Artifact<'subscription'>>(
  subscription: T,
  ...[variables, options]: VariablesOf<T> extends undefined
    ? [undefined?, CreateSubscriptionOptions<T>?]
    : [Accessor<VariablesOf<T>>, CreateSubscriptionOptions<T>?]
): Subscription<T> => {
  const [data] = createSignal<DataOf<T>>();
  const [loading] = createSignal(true);
  const [error] = createSignal<Error>();

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
  } as Subscription<T>;
};
