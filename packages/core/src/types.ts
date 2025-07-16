export type MaybePromise<T> = T | Promise<T>;

export type Exact<T extends Record<string, unknown>> = { [K in keyof T]: T[K] };

export type Nullable<T> = T | null;

export type List<T> = ReadonlyArray<T>;

export type Source = {
  code: string;
  filePath: string;
  startLine: number;
};

export type DocumentNode<Data = unknown, Variables = unknown> = {
  readonly hash: number;
  readonly name: string;
  readonly body: string;
  readonly kind: 'query' | 'mutation' | 'subscription' | 'fragment';
  readonly selections: readonly SelectionNode[];
  readonly __data?: Data;
  readonly __variables?: Variables;
};

export type SelectionNode = {
  name: string;
  type?: string;
  array?: boolean;
  on?: string[];
  alias?: string;
  args?: Record<string, ArgumentValue>;
  selections?: readonly SelectionNode[];
};

export type ArgumentValue = { kind: 'literal'; value: unknown } | { kind: 'variable'; name: string };

export type SchemaMetadata = {
  entities: Record<string, EntityMetadata>;
};

export type EntityMetadata = {
  keyFields: string[];
};

export type Operation<Data = unknown, Variables = unknown> = {
  kind: 'query' | 'mutation' | 'subscription';
  document: DocumentNode<Data, Variables>;
  variables?: Variables;
  name?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type DataOf<Document extends DocumentNode> = Document extends DocumentNode<infer D, unknown> ? D : never;
export type VariablesOf<Document extends DocumentNode> = Document extends DocumentNode<unknown, infer V> ? V : never;

export type FragmentRef<Document extends DocumentNode> = {
  readonly ' $fragmentRefs': Readonly<Record<Document['name'], true>>;
};
