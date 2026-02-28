import type { MaybePromise, SchemaMeta } from '@mearie/shared';
import type { EntityLinkKey, RootFieldKey } from './constants.ts';

/**
 * Unique identifier for an entity in the format "typename:id1:id2:...".
 * @internal
 */
export type EntityKey = `${string}:${string}`;

/**
 * Storage key that can be either an entity key or the root field key.
 * @internal
 */
export type StorageKey = EntityKey | typeof RootFieldKey;

/**
 * Field key used to identify fields in the cache.
 * @internal
 */
export type FieldKey = `${string}@${string}`;

/**
 * Scalar values that can be stored in the cache.
 * @internal
 */
export type Scalar = string | number | boolean | null;

/**
 * Unique identifier for an query based on operation name and variables.
 * @internal
 */
export type QueryKey = `${string}@${string}`;

/**
 * Key for tracking previous denormalized results for structural sharing.
 * @internal
 */
export type MemoKey = string;

/**
 * Dependency key in the format "storageKey.field" used to track field dependencies.
 * @internal
 */
export type DependencyKey = `${StorageKey}.${FieldKey}`;

/**
 * Entity link object that references an entity in the cache.
 * @internal
 */
export type EntityLink = { [EntityLinkKey]: EntityKey };

/**
 * Field value that can be stored in the cache.
 * @internal
 */
export type FieldValue = Scalar | EntityLink | { [key: string]: FieldValue } | FieldValue[] | undefined;

/**
 * Fields record containing field keys and their values.
 * @internal
 */
export type Fields = Record<FieldKey, FieldValue>;

/**
 * Storage map containing normalized entities and root query fields.
 * @internal
 */
export type Storage = Record<StorageKey, Fields>;

/**
 * GraphQL response data type.
 * @internal
 */
export type Data = {
  [key: string]: Scalar | Scalar[] | Data | Data[];
};

/**
 * Listener function.
 * @internal
 */
export type Listener = () => MaybePromise<void>;

export type Subscription = { listener: Listener };

type EntityTypes<TMeta extends SchemaMeta> = NonNullable<TMeta[' $entityTypes']>;
type QueryFields<TMeta extends SchemaMeta> = NonNullable<TMeta[' $queryFields']>;
type KeyFieldsOf<E> = E extends { keyFields: infer KF } ? KF : Record<string, unknown>;
type FieldsOf<E> = E extends { fields: infer F extends string } ? F : string;

type EntityInvalidateTarget<Entities> = {
  [K in keyof Entities & string]:
    | { __typename: K }
    | ({ __typename: K } & KeyFieldsOf<Entities[K]>)
    | { __typename: K; $field: FieldsOf<Entities[K]>; $args?: Record<string, unknown> }
    | ({ __typename: K; $field: FieldsOf<Entities[K]>; $args?: Record<string, unknown> } & KeyFieldsOf<Entities[K]>);
}[keyof Entities & string];

type QueryInvalidateTarget<QF extends string> =
  | { __typename: 'Query' }
  | { __typename: 'Query'; $field: QF; $args?: Record<string, unknown> };

/**
 * Target specification for cache invalidation operations.
 */
export type InvalidateTarget<TMeta extends SchemaMeta = SchemaMeta> =
  | EntityInvalidateTarget<EntityTypes<TMeta>>
  | QueryInvalidateTarget<QueryFields<TMeta>>;

/**
 * Opaque type representing a serializable cache snapshot.
 */
export type CacheSnapshot = { readonly __brand: unique symbol };

/**
 * Operations available for programmatic cache manipulation.
 */
export type CacheOperations<TMeta extends SchemaMeta = SchemaMeta> = {
  extract(): CacheSnapshot;
  hydrate(data: CacheSnapshot): void;
  invalidate(...targets: InvalidateTarget<TMeta>[]): void;
  clear(): void;
};
