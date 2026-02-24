import type { FieldSelection, Argument, FragmentRefs } from '@mearie/shared';
import { stringify } from '../utils.ts';
import { EntityLinkKey, FragmentRefKey } from './constants.ts';
import type { EntityId, EntityKey, FieldKey, QueryKey, DependencyKey, StorageKey, EntityLink } from './types.ts';

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
 * Converts an EntityId to an EntityKey.
 * @internal
 * @param typename - The GraphQL typename of the entity.
 * @param id - The entity identifier (string, number, or composite key record).
 * @param keyFields - Optional ordered list of key field names for composite keys.
 * @returns An EntityKey.
 */
export const resolveEntityKey = (typename: string, id: EntityId, keyFields?: string[]): EntityKey => {
  if (typeof id === 'string' || typeof id === 'number') {
    return makeEntityKey(typename, [id]);
  }
  const values = keyFields ? keyFields.map((f) => id[f]) : Object.values(id);
  return makeEntityKey(typename, values);
};
