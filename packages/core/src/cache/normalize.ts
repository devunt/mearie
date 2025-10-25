import type { Selection, SchemaMeta } from '@mearie/shared';
import { makeEntityKey, makeFieldKey, isEntityLink } from './utils.ts';
import { EntityLinkKey, RootFieldKey } from './constants.ts';
import type { StorageKey, FieldKey, Storage } from './types.ts';

export const normalize = (
  schemaMeta: SchemaMeta,
  selections: readonly Selection[],
  storage: Storage,
  data: unknown,
  variables: Record<string, unknown>,
  accessor?: (storageKey: StorageKey, fieldKey: FieldKey, oldValue: unknown, newValue: unknown) => void,
): void => {
  const normalizeField = (storageKey: StorageKey | null, selections: readonly Selection[], value: unknown): unknown => {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => normalizeField(storageKey, selections, item));
    }

    const data = value as Record<string, unknown>;

    const typename = data.__typename as string;
    const entityMeta = schemaMeta.entities[typename];
    if (entityMeta) {
      const keys = entityMeta.keyFields.map((field) => data[field]);
      storageKey = makeEntityKey(typename, keys);
    }

    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[selection.alias ?? selection.name];

        if (storageKey !== null) {
          accessor?.(storageKey, fieldKey, storage[storageKey]?.[fieldKey], fieldValue);
        }

        fields[fieldKey] = selection.selections ? normalizeField(null, selection.selections, fieldValue) : fieldValue;
      } else if (
        selection.kind === 'FragmentSpread' ||
        (selection.kind === 'InlineFragment' && selection.on === typename)
      ) {
        const inner = normalizeField(storageKey, selection.selections, value);
        if (!isEntityLink(inner)) {
          Object.assign(fields, inner);
        }
      }
    }

    if (entityMeta && storageKey !== null) {
      storage[storageKey] = { ...storage[storageKey], ...fields };
      return { [EntityLinkKey]: storageKey };
    }

    return fields;
  };

  const fields = normalizeField(RootFieldKey, selections, data) as Record<string, unknown>;
  storage[RootFieldKey] = { ...storage[RootFieldKey], ...fields };
};
