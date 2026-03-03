import type { FieldSelection, Argument, FragmentRefs } from '@mearie/shared';
import { stringify } from '../utils.ts';
import { EntityLinkKey, FragmentRefKey, FragmentVarsKey } from './constants.ts';
import type { EntityKey, FieldKey, QueryKey, DependencyKey, StorageKey, EntityLink } from './types.ts';

/**
 * Generates a unique cache key for an entity based on its typename and key field values.
 * @internal
 * @param typename - The GraphQL typename of the entity.
 * @param keyValues - Array of key field values used to identify the entity.
 * @returns A unique entity key in the format "typename:value1:value2:...".
 */
export const makeEntityKey = (typename: string, keyValues: unknown[]): EntityKey => {
  return `${typename}:${keyValues.join(':')}`;
};

/**
 * Resolves GraphQL arguments by replacing variable references with their actual values.
 * @internal
 * @param args - Argument definitions from the query, containing either literal values or variable references.
 * @param variables - Object containing the actual variable values.
 * @returns Object with all arguments resolved to their actual values.
 */
export const resolveArguments = (
  args: Record<string, Argument>,
  variables: Record<string, unknown>,
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, value.kind === 'literal' ? value.value : variables[value.name]]),
  );
};

/**
 * Generates a cache key for a GraphQL field selection.
 * Always uses the actual field name (not alias) with a stringified representation of the arguments.
 * @internal
 * @param selection - The field selection node containing field information.
 * @param variables - Variable values for resolving argument references.
 * @returns Field cache key string in "fieldName@argsString" format.
 */
export const makeFieldKey = (selection: FieldSelection, variables: Record<string, unknown>): FieldKey => {
  const args =
    selection.args && Object.keys(selection.args).length > 0
      ? stringify(resolveArguments(selection.args, variables))
      : '{}';

  return `${selection.name}@${args}`;
};

/**
 * Creates a unique query key combining operation name and variables.
 * @internal
 * @param operationName - Operation name.
 * @param variables - Variables.
 * @returns Unique query key.
 */
export const makeQueryKey = (operationName: string, variables: Record<string, unknown>): QueryKey => {
  return `${operationName}@${stringify(variables)}`;
};

/**
 * Gets a unique key for tracking a field dependency.
 * @internal
 * @param storageKey Storage key (entity or root query key).
 * @param fieldKey Field key.
 * @returns Unique dependency key in the format "storageKey.field".
 */
export const makeDependencyKey = (storageKey: StorageKey, fieldKey: FieldKey): DependencyKey => {
  return `${storageKey}.${fieldKey}`;
};

/**
 * Type guard to check if a value is an entity link.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is an EntityLink.
 */
export const isEntityLink = (value: unknown): value is EntityLink => {
  return typeof value === 'object' && value !== null && EntityLinkKey in value;
};

/**
 * Type guard to check if a value is a fragment reference.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is a FragmentRef.
 */
export const isFragmentRef = (value: unknown): value is FragmentRefs<string> => {
  return typeof value === 'object' && value !== null && FragmentRefKey in value;
};

/**
 * Extracts the merged variable context for a specific fragment from a fragment reference.
 * Returns the merged variables (fragment args + operation variables) if present, or an empty object.
 * @internal
 */
export const getFragmentVars = (fragmentRef: FragmentRefs<string>, fragmentName: string): Record<string, unknown> => {
  return (
    (fragmentRef as unknown as { [FragmentVarsKey]?: Record<string, Record<string, unknown>> })[FragmentVarsKey]?.[
      fragmentName
    ] ?? {}
  );
};

/**
 * Type guard to check if a value is an array of fragment references.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is a FragmentRef array.
 */
export const isFragmentRefArray = (value: unknown): value is FragmentRefs<string>[] => {
  return Array.isArray(value) && value.length > 0 && isFragmentRef(value[0]);
};

/**
 * Type guard to check if a value is nullish.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is nullish.
 */
export const isNullish = (value: unknown): value is null | undefined => {
  return value === undefined || value === null;
};

/**
 * Deep equality check for normalized cache values.
 * Handles scalars, arrays, and plain objects (entity links, value objects).
 * @internal
 */
export const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (const [i, item] of a.entries()) {
      if (!isEqual(item, b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    if (aKeys.length !== Object.keys(bObj).length) return false;
    for (const key of aKeys) {
      if (!isEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
};

const NormalizedKey: unique symbol = Symbol('mearie.normalized');

/**
 * Marks a record as a normalized cache object so that {@link mergeFields}
 * can distinguish it from opaque scalar values (e.g. JSON scalars).
 * Only normalized records are deep-merged; unmarked objects are treated as
 * atomic values and replaced entirely on write.
 * @internal
 */
export const markNormalized = (obj: object): void => {
  Object.defineProperty(obj, NormalizedKey, { value: true });
};

export const isNormalizedRecord = (value: unknown): boolean => {
  return typeof value === 'object' && value !== null && NormalizedKey in value;
};

/**
 * Deeply merges two values. When {@link deep} is false (default), only
 * {@link markNormalized normalized} cache objects are recursively merged;
 * unmarked plain objects (e.g. JSON scalars) are atomically replaced.
 * When {@link deep} is true, all objects are recursively merged unconditionally.
 * Arrays are element-wise merged, entity links and primitives use last-write-wins.
 * @internal
 */
const mergeFieldValue = (existing: unknown, incoming: unknown, deep: boolean): unknown => {
  if (isNullish(existing) || isNullish(incoming)) {
    return incoming;
  }

  if (typeof existing !== 'object' || typeof incoming !== 'object') {
    return incoming;
  }

  if (isEntityLink(existing) || isEntityLink(incoming)) {
    return incoming;
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return incoming.map((item: unknown, i: number): unknown =>
      i < existing.length ? mergeFieldValue(existing[i], item, deep) : item,
    );
  }

  if (Array.isArray(existing) || Array.isArray(incoming)) {
    return incoming;
  }

  if (!deep && !isNormalizedRecord(incoming)) {
    return incoming;
  }

  mergeFields(existing as Record<string, unknown>, incoming, deep);
  return existing;
};

/**
 * Deeply merges source fields into target.
 * When {@link deep} is false (default), only {@link markNormalized normalized}
 * objects are recursively merged; unmarked objects are atomically replaced.
 * When {@link deep} is true, all objects are recursively merged unconditionally.
 * @internal
 */
export const mergeFields = (target: Record<string, unknown>, source: unknown, deep?: boolean): void => {
  if (isNullish(source) || typeof source !== 'object' || Array.isArray(source)) {
    return;
  }
  for (const key of Object.keys(source)) {
    target[key] = mergeFieldValue(target[key], (source as Record<string, unknown>)[key], deep ?? false);
  }
};

/**
 * Creates a FieldKey from a raw field name and optional arguments.
 * @internal
 * @param field - The field name.
 * @param args - Optional argument values.
 * @returns A FieldKey in "field@args" format.
 */
export const makeFieldKeyFromArgs = (field: string, args?: Record<string, unknown>): FieldKey => {
  const argsStr = args && Object.keys(args).length > 0 ? stringify(args) : '{}';
  return `${field}@${argsStr}`;
};

/**
 * Type guard to check if a value is an array containing entity links.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is an array containing at least one entity link.
 */
export const isEntityLinkArray = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length === 0) return false;

  for (const item of value) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'object' && !Array.isArray(item) && EntityLinkKey in (item as object)) return true;
    if (Array.isArray(item) && isEntityLinkArray(item)) return true;
    return false;
  }

  return false;
};

/**
 * Compares two entity link arrays by their entity keys.
 * @internal
 * @param a - First entity link array.
 * @param b - Second entity link array.
 * @returns True if both arrays have the same entity keys at each position.
 */
export const isEntityLinkArrayEqual = (a: unknown[], b: unknown[]): boolean => {
  if (a.length !== b.length) return false;

  for (const [i, element] of a.entries()) {
    const aKey = (element as EntityLink | null)?.[EntityLinkKey] ?? null;
    const bKey = (b[i] as EntityLink | null)?.[EntityLinkKey] ?? null;
    if (aKey !== bKey) return false;
  }

  return true;
};

/**
 * Parses a dependency key into its storage key and field key components.
 * @internal
 * @param depKey - The dependency key to parse.
 * @returns The storage key and field key.
 */
export const parseDependencyKey = (depKey: DependencyKey): { storageKey: StorageKey; fieldKey: FieldKey } => {
  const atIdx = depKey.indexOf('@');
  const dotIdx = depKey.lastIndexOf('.', atIdx);
  return {
    storageKey: depKey.slice(0, dotIdx) as StorageKey,
    fieldKey: depKey.slice(dotIdx + 1) as FieldKey,
  };
};
