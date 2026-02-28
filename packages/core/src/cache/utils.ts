import type { FieldSelection, Argument, FragmentRefs } from '@mearie/shared';
import { stringify } from '../utils.ts';
import { EntityLinkKey, FragmentRefKey } from './constants.ts';
import type { EntityKey, FieldKey, QueryKey, DependencyKey, StorageKey, EntityLink, MemoKey } from './types.ts';

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
 * Generates a unique key for tracking memoized denormalized results for structural sharing.
 * @internal
 * @param kind - The operation kind ('query', 'fragment', 'fragments').
 * @param name - The artifact name.
 * @param id - Serialized identifier (variables, entity key, etc.).
 * @returns A unique memo key.
 */
export const makeMemoKey = (kind: string, name: string, id: string): MemoKey => `${kind}:${name}:${id}`;

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

/**
 * Recursively replaces a new value tree with the previous one wherever structurally equal,
 * preserving referential identity for unchanged subtrees.
 *
 * Returns `prev` (same reference) when the entire subtree is structurally equal.
 * @internal
 */
export const replaceEqualDeep = (prev: unknown, next: unknown): unknown => {
  if (prev === next) {
    return prev;
  }

  if (typeof prev !== typeof next || prev === null || next === null || typeof prev !== 'object') {
    return next;
  }

  if (Array.isArray(prev)) {
    if (!Array.isArray(next)) {
      return next;
    }

    let allSame = prev.length === next.length;
    const result: unknown[] = [];

    for (const [i, item] of (next as unknown[]).entries()) {
      const shared = i < prev.length ? replaceEqualDeep((prev as unknown[])[i], item) : item;
      result.push(shared);
      if (shared !== (prev as unknown[])[i]) {
        allSame = false;
      }
    }

    return allSame ? prev : result;
  }

  if (Array.isArray(next)) {
    return next;
  }

  const prevObj = prev as Record<string, unknown>;
  const nextObj = next as Record<string, unknown>;
  const nextKeys = Object.keys(nextObj);
  const prevKeys = Object.keys(prevObj);

  let allSame = nextKeys.length === prevKeys.length;
  const result: Record<string, unknown> = {};

  for (const key of nextKeys) {
    if (key in prevObj) {
      result[key] = replaceEqualDeep(prevObj[key], nextObj[key]);
      if (result[key] !== prevObj[key]) {
        allSame = false;
      }
    } else {
      result[key] = nextObj[key];
      allSame = false;
    }
  }

  return allSame ? prev : result;
};

/**
 * Deeply merges two values. Objects are recursively merged, arrays are element-wise merged,
 * entity links and primitives use last-write-wins.
 * @internal
 */
const mergeFieldValue = (existing: unknown, incoming: unknown): unknown => {
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
      i < existing.length ? mergeFieldValue(existing[i], item) : item,
    );
  }

  if (Array.isArray(existing) || Array.isArray(incoming)) {
    return incoming;
  }

  mergeFields(existing as Record<string, unknown>, incoming);
  return existing;
};

/**
 * Deeply merges source fields into target. Objects are recursively merged,
 * arrays are element-wise merged, entity links and primitives use last-write-wins.
 * @internal
 */
export const mergeFields = (target: Record<string, unknown>, source: unknown): void => {
  if (isNullish(source) || typeof source !== 'object' || Array.isArray(source)) {
    return;
  }
  for (const key of Object.keys(source)) {
    target[key] = mergeFieldValue(target[key], (source as Record<string, unknown>)[key]);
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
