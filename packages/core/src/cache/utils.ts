import type { SelectionNode, SchemaMetadata, ArgumentValue, EntityMetadata } from '../types.ts';
import { stableStringify, hashString, combineHashes } from '../utils.ts';
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
  args: Record<string, ArgumentValue>,
  variables: Record<string, unknown>,
): Record<string, unknown> => {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    resolved[key] = value.kind === 'literal' ? value.value : variables[value.name];
  }

  return resolved;
};

/**
 * Generates a cache key for a GraphQL field selection.
 * Always uses the actual field name (not alias) with a hash of the arguments.
 * @internal
 * @param selection - The selection node containing field information.
 * @param variables - Variable values for resolving argument references.
 * @returns Field cache key string in "fieldName@argsHash" format.
 */
export const makeFieldKey = (selection: SelectionNode, variables: Record<string, unknown>): FieldKey => {
  const resolvedArgs = selection.args ? resolveArguments(selection.args, variables) : {};
  const argsHash = hashString(stableStringify(resolvedArgs));
  return `${selection.name}@${argsHash}`;
};

/**
 * Retrieves entity metadata from the schema for a given typename.
 * @internal
 * @param typename - The GraphQL typename to look up.
 * @param schemaMetadata - The schema metadata containing entity configurations.
 * @returns Entity metadata if found, undefined otherwise.
 */
export const getEntityMetadata = (
  typename: string | undefined,
  schemaMetadata: SchemaMetadata,
): EntityMetadata | undefined => {
  return typename ? schemaMetadata.entities[typename] : undefined;
};

/**
 * Determines whether a selection represents a GraphQL entity based on the schema metadata.
 * @internal
 * @param selection - The selection node to check.
 * @param schemaMetadata - The schema metadata containing entity configurations.
 * @returns True if the selection's type is defined as an entity in the schema.
 */
export const isEntity = (selection: SelectionNode, schemaMetadata: SchemaMetadata): boolean => {
  return selection.type !== undefined && schemaMetadata.entities[selection.type] !== undefined;
};

/**
 * Creates a unique query key combining document hash and variables.
 * @internal
 * @param hash - Document hash.
 * @param variables - Query variables.
 * @returns Unique query key.
 */
export const makeQueryKey = (hash: number, variables: unknown): QueryKey => {
  if (!variables || (typeof variables === 'object' && Object.keys(variables).length === 0)) {
    return hash;
  }

  const varsHash = hashString(stableStringify(variables));
  return combineHashes(hash, varsHash);
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
