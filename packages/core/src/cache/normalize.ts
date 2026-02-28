import type { Selection, SchemaMeta } from '@mearie/shared';
import { makeEntityKey, makeFieldKey, isEntityLink, isNullish, isEqual, mergeFields } from './utils.ts';
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
    if (isNullish(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => normalizeField(storageKey, selections, item));
    }

    const data = value as Record<string, unknown>;

    const typename = data.__typename as string;
    let entityMeta = schemaMeta.entities[typename];
    if (entityMeta) {
      const keys = entityMeta.keyFields.map((field) => data[field]);
      if (keys.every((k) => k !== undefined && k !== null)) {
        storageKey = makeEntityKey(typename, keys);
      } else {
        entityMeta = undefined;
      }
    }

    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[selection.alias ?? selection.name];

        const oldValue = storageKey === null ? undefined : storage[storageKey]?.[fieldKey];

        if (storageKey !== null && (!selection.selections || isNullish(oldValue) || isNullish(fieldValue))) {
          accessor?.(storageKey, fieldKey, oldValue, fieldValue);
        }

        const normalized = selection.selections ? normalizeField(null, selection.selections, fieldValue) : fieldValue;
        fields[fieldKey] = normalized;

        if (
          storageKey !== null &&
          selection.selections &&
          !isNullish(oldValue) &&
          !isNullish(fieldValue) &&
          !isEntityLink(fields[fieldKey]) &&
          !isEqual(oldValue, fields[fieldKey])
        ) {
          accessor?.(storageKey, fieldKey, oldValue, fields[fieldKey]);
        }
      } else if (
        selection.kind === 'FragmentSpread' ||
        (selection.kind === 'InlineFragment' && selection.on === typename)
      ) {
        const inner = normalizeField(storageKey, selection.selections, value);
        if (!isEntityLink(inner)) {
          mergeFields(fields, inner);
        }
      }
    }

    if (entityMeta && storageKey !== null) {
      const existing = storage[storageKey];
      if (existing) {
        mergeFields(existing, fields);
      } else {
        storage[storageKey] = fields as Storage[StorageKey];
      }
      return { [EntityLinkKey]: storageKey };
    }

    return fields;
  };

  const fields = normalizeField(RootFieldKey, selections, data) as Record<string, unknown>;
  storage[RootFieldKey] = { ...storage[RootFieldKey], ...fields };
};
