import { createSignal, type Accessor } from 'solid-js';
import type { DocumentNode, VariablesOf, DataOf } from '@mearie/core';

export type CreateQueryReturn<Document extends DocumentNode> =
  | {
      data: undefined;
      loading: true;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<Document>;
      loading: false;
      error: undefined;
      refetch: () => void;
    }
  | {
      data: DataOf<Document> | undefined;
      loading: false;
      error: Error;
      refetch: () => void;
    };

export const createQuery = <Document extends DocumentNode>(
  document: Document,
  variables: Accessor<VariablesOf<Document>>,
): CreateQueryReturn<Document> => {
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
    refetch: () => {},
  };
};
