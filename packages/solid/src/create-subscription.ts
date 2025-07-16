import { createSignal, type Accessor } from 'solid-js';
import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type CreateSubscriptionReturn<Document extends DocumentNode> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
    }
  | {
      data: DataOf<Document>;
      loading: false;
      error: undefined;
    }
  | {
      data: DataOf<Document> | undefined;
      loading: false;
      error: Error;
    };

export type CreateSubscriptionOptions<Document extends DocumentNode> = {
  onData?: (data: DataOf<Document>) => void;
  onError?: (error: Error) => void;
};

export const createSubscription = <Document extends DocumentNode>(
  document: Document,
  variables: Accessor<VariablesOf<Document>>,
  options?: CreateSubscriptionOptions<Document>,
): CreateSubscriptionReturn<Document> => {
  const [data] = createSignal<DataOf<Document>>();
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
  } as CreateSubscriptionReturn<Document>;
};
