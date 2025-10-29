import type { MaybePromise } from '@mearie/shared';
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
