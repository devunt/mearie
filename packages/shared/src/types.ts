export type MaybePromise<T> = T | Promise<T>;

export type Nullable<T> = T | null;

export type List<T> = readonly T[];

export type Opaque<T> = T & { readonly ' $opaque'?: unique symbol };

export type ArtifactKind = 'query' | 'mutation' | 'subscription' | 'fragment';

export type Artifact<
  Kind extends ArtifactKind = ArtifactKind,
  Name extends string = string,
  Data = unknown,
  Variables = unknown,
> = {
  readonly kind: Kind;
  readonly name: Name;
  readonly source: string;
  readonly selections: readonly Selection[];

  readonly ' $data'?: Data;
  readonly ' $variables'?: Variables;
};

export type Selection = FieldSelection | FragmentSpreadSelection | InlineFragmentSelection;

export type FieldSelection = {
  kind: 'Field';
  name: string;
  type?: string;
  array?: boolean;
  alias?: string;
  args?: Record<string, Argument>;
  selections?: Selection[];
};

export type FragmentSpreadSelection = {
  kind: 'FragmentSpread';
  name: string;
  selections: Selection[];
};

export type InlineFragmentSelection = {
  kind: 'InlineFragment';
  on: string;
  selections: Selection[];
};

export type Argument = { kind: 'literal'; value: unknown } | { kind: 'variable'; name: string };

export type FragmentRefs<T extends string> = {
  readonly ' $fragmentRefs': T;
};

export type DataOf<T extends Artifact> = NonNullable<T[' $data']>;
export type VariablesOf<T extends Artifact> = NonNullable<T[' $variables']>;
