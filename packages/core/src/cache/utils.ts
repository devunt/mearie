import type { FieldSelection, Argument } from '@mearie/shared';
import { stringify } from '../utils.ts';
import { EntityLinkKey } from './constants.ts';
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
