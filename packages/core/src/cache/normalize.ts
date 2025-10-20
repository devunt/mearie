import type { Selection } from '@mearie/shared';
import type { SchemaMeta } from '../types.ts';
import { makeEntityKey, makeFieldKey, getEntityMetadata } from './utils.ts';
import { EntityLinkKey, RootFieldKey } from './constants.ts';
import type { StorageKey, FieldKey, Storage, Fields } from './types.ts';

type Accessor = (storageKey: StorageKey, fieldKey: FieldKey) => void;

/**
 * @param data - The data to normalize.
 * @param selections - The selection nodes.
 * @param schemaMetadata - The schema metadata.
 * @param storage - The normalized storage map.
 * @param variables - The variable values.
 * @param accessor - Callback invoked when a field dependency is encountered.
 */
export const normalize = (
  data: unknown,
  selections: readonly Selection[],
  schemaMetadata: SchemaMeta,
  storage: Storage,
  variables: Record<string, unknown>,
  accessor: Accessor,
): void => {
  const normalizeField = (parentKey: StorageKey, selections: readonly Selection[], value: unknown): unknown => {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const data = value as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      const fieldKey = makeFieldKey(selection, variables);
      const fieldValue = data[selection.alias ?? selection.name];

      accessor(parentKey, fieldKey);

      if (fieldValue === undefined) {
        continue;
      }

      if (Array.isArray(fieldValue)) {
        fields[fieldKey] = fieldValue.map((item: unknown) =>
          selection.selections ? normalizeField(parentKey, selection.selections, item) : item,
        );
      } else if (selection.selections) {
        fields[fieldKey] = normalizeField(parentKey, selection.selections, fieldValue);
      } else {
        fields[fieldKey] = fieldValue;
      }
    }

    const typename = data.__typename as string | undefined;
    const entityMetadata = typename ? getEntityMetadata(typename, schemaMetadata) : undefined;

    if (entityMetadata) {
      const keyValues: unknown[] = [];

      for (const field of entityMetadata.keyFields) {
        const fieldValue = data[field];
        if (fieldValue == null) {
          return fields;
        }
        keyValues.push(fieldValue);
      }

      const entityKey = makeEntityKey(typename!, keyValues);
      const existingEntity = storage.get(entityKey) ?? {};
      const normalized = { ...existingEntity, ...fields };

      storage.set(entityKey, normalized as Fields);

      return { [EntityLinkKey]: entityKey };
    }

    return fields;
  };

  if (data === null || typeof data !== 'object') {
    return;
  }

  const existingRoot = storage.get(RootFieldKey) ?? {};
  const result = normalizeField(RootFieldKey, selections, data);
  storage.set(RootFieldKey, { ...existingRoot, ...(result as object) } as Fields);
};
