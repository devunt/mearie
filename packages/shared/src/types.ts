export type MaybePromise<T> = T | Promise<T>;

export type Nullable<T> = T | null;

export type List<T> = readonly T[];

export type Opaque<T> = T & { readonly ' $opaque'?: unique symbol };

export type ScalarMeta = Record<string, unknown>;

export type SchemaMetaProps = {
  scalars: ScalarMeta;
  entities: Record<string, { keyFields: Record<string, unknown>; fields: string }>;
  queryFields: string;
};

export type SchemaMeta<T extends SchemaMetaProps = SchemaMetaProps> = {
  entities: Record<string, EntityMeta>;
  inputs: Record<string, InputMeta>;
  scalars: T['scalars'];
  readonly ' $entityTypes'?: T['entities'];
  readonly ' $queryFields'?: T['queryFields'];
};

export type EntityMeta = {
  keyFields: string[];
};

export type InputMeta = {
  fields: readonly InputFieldMeta[];
};

export type InputFieldMeta = {
  name: string;
  type: string;
  array?: boolean;
};

export type ArtifactKind = 'query' | 'mutation' | 'subscription' | 'fragment';
export type OperationKind = Extract<ArtifactKind, 'query' | 'mutation' | 'subscription'>;

export type Artifact<
  Kind extends ArtifactKind = ArtifactKind,
  Name extends string = string,
  Data = unknown,
  Variables = unknown,
> = {
  readonly kind: Kind;
  readonly name: Name;
  readonly body: string;
  readonly selections: readonly Selection[];
  readonly variableDefs?: readonly VariableDef[];

  readonly ' $data'?: Data;
  readonly ' $variables'?: Variables;
};

export type VariableDef = {
  name: string;
  type: string;
  array?: boolean;
  nullable?: boolean;
};

export type Selection = FieldSelection | FragmentSpreadSelection | InlineFragmentSelection;

export type FieldSelection = {
  kind: 'Field';
  name: string;
  type: string;
  array?: boolean;
  nullable?: boolean;
  alias?: string;
  args?: Record<string, Argument>;
  selections?: Selection[];
  directives?: Directive[];
};

export type Directive = {
  name: string;
  args?: Record<string, unknown>;
};

export type FragmentSpreadSelection = {
  kind: 'FragmentSpread';
  name: string;
  args?: Record<string, Argument>;
  selections: Selection[];
};

export type InlineFragmentSelection = {
  kind: 'InlineFragment';
  on: string;
  selections: Selection[];
};

export type Argument = { kind: 'literal'; value: unknown } | { kind: 'variable'; name: string };

export type FragmentRefs<T extends string> = {
  readonly ' $fragmentRefs': Record<T, true>;
};

export type DataOf<T extends Artifact> = NonNullable<T[' $data']>;
export type VariablesOf<T extends Artifact> = NonNullable<T[' $variables']>;
