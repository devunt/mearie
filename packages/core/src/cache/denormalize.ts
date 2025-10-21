import type { Selection } from '@mearie/shared';
import { makeFieldKey, isEntityLink } from './utils.ts';
import { EntityLinkKey, RootFieldKey, FragmentRefKey } from './constants.ts';
import type { StorageKey } from './types.ts';

/**
 * @param value - The value to denormalize.
 * @param selection - The selection node.
 * @param storage - The normalized storage map.
 * @param variables - The variable values.
 * @param sourceData - The source data object.
 * @returns The denormalized value.
 */
const denormalizeValue = (
  value: unknown,
  selection: Selection,
  storage: Map<StorageKey, Record<string, unknown>>,
  variables: Record<string, unknown>,
  sourceData?: Record<string | symbol, unknown>,
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (selection.kind === 'Field' && selection.array && Array.isArray(value)) {
    return value.map((item) => denormalizeValue(item, selection, storage, variables, sourceData));
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const data = value as Record<string | symbol, unknown>;
  let source = sourceData ?? data;
  let entityKey: string | undefined;

  if (isEntityLink(data)) {
    const entity = storage.get(data[EntityLinkKey]);
    if (!entity || !selection.selections) {
      return value;
    }
    source = entity;
    sourceData = entity;
    entityKey = data[EntityLinkKey];
  }

  if (!selection.selections) {
    return value;
  }

  const result: Record<string | symbol, unknown> = {};
  let hasFragmentSpread = false;

  for (const childSelection of selection.selections) {
    if (childSelection.kind === 'Field') {
      const fieldKey = sourceData
        ? makeFieldKey(childSelection, variables)
        : (childSelection.alias ?? childSelection.name);
      const responseKey = childSelection.alias ?? childSelection.name;
      const fieldValue = source[fieldKey];

      if (fieldValue !== undefined) {
        result[responseKey] = denormalizeValue(fieldValue, childSelection, storage, variables, sourceData);
      }
    } else if (childSelection.kind === 'FragmentSpread') {
      hasFragmentSpread = true;
    } else if (childSelection.kind === 'InlineFragment') {
      const typename = source.__typename as string | undefined;
      if (typename === childSelection.on) {
        const inlineResult = denormalizeValue(value, childSelection, storage, variables, sourceData);
        Object.assign(result, inlineResult);
      }
    }
  }

  if (entityKey && hasFragmentSpread) {
    result[FragmentRefKey] = entityKey;
  }

  return result;
};

/**
 * @param selections - The selection nodes.
 * @param storage - The normalized storage map.
 * @param variables - The variable values.
 * @returns The denormalized data.
 */
export const denormalize = (
  selections: readonly Selection[],
  storage: Map<StorageKey, Record<string, unknown>>,
  variables: Record<string, unknown>,
): unknown => {
  const queryRoot = storage.get(RootFieldKey);

  if (!queryRoot) {
    return null;
  }

  const result: Record<string, unknown> = {};

  const processSelections = (sels: readonly Selection[]): void => {
    for (const selection of sels) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const responseKey = selection.alias ?? selection.name;
        const fieldValue = queryRoot[fieldKey];

        if (fieldValue !== undefined) {
          result[responseKey] = denormalizeValue(fieldValue, selection, storage, variables, queryRoot);
        }
      } else if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
        processSelections(selection.selections);
      }
    }
  };

  processSelections(selections);

  return Object.keys(result).length === 0 ? null : result;
};
