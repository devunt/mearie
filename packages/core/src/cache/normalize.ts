import type { Selection, SchemaMeta } from '@mearie/shared';
import { makeEntityKey, makeFieldKey, isEntityLink, isNullish, isEqual, mergeFields } from './utils.ts';
import { EntityLinkKey, RootFieldKey } from './constants.ts';
import type { StorageKey, FieldKey, Storage } from './types.ts';

const resolveTypename = (selections: readonly Selection[], data: Record<string, unknown>): string | undefined => {
  for (const s of selections) {
    if (s.kind === 'Field' && s.name === '__typename') {
      return data[s.alias ?? '__typename'] as string;
    }
  }
  return data.__typename as string | undefined;
};

export const normalize = (
  schemaMeta: SchemaMeta,
  selections: readonly Selection[],
  storage: Storage,
  data: unknown,
  variables: Record<string, unknown>,
  accessor?: (storageKey: StorageKey, fieldKey: FieldKey, oldValue: unknown, newValue: unknown) => void,
): void => {
  const resolveEntityKey = (typename: string | undefined, data: Record<string, unknown>): StorageKey | null => {
    if (!typename) return null;
    const entityMeta = schemaMeta.entities[typename];
    if (!entityMeta) return null;
    const keys = entityMeta.keyFields.map((field) => data[field]);
    if (keys.every((k) => k !== undefined && k !== null)) {
      return makeEntityKey(typename, keys);
    }
    return null;
  };

  const normalizeField = (storageKey: StorageKey | null, selections: readonly Selection[], value: unknown): unknown => {
    if (isNullish(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => normalizeField(storageKey, selections, item));
    }

    const data = value as Record<string, unknown>;

    const typename = resolveTypename(selections, data);
    const entityKey = resolveEntityKey(typename, data);
    if (entityKey) {
      storageKey = entityKey;
    }

    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[selection.alias ?? selection.name];

        if (
          storageKey !== null &&
          selection.selections &&
          typeof fieldValue === 'object' &&
          fieldValue !== null &&
          !Array.isArray(fieldValue)
        ) {
          const fieldTypename = resolveTypename(selection.selections, fieldValue as Record<string, unknown>);
          if (
            fieldTypename &&
            schemaMeta.entities[fieldTypename] &&
            !resolveEntityKey(fieldTypename, fieldValue as Record<string, unknown>) &&
            isEntityLink(storage[storageKey]?.[fieldKey])
          ) {
            continue;
          }
        }

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

    if (entityKey) {
      const existing = storage[entityKey];
      if (existing) {
        mergeFields(existing, fields);
      } else {
        storage[entityKey] = fields as Storage[StorageKey];
      }
      return { [EntityLinkKey]: entityKey };
    }

    return fields;
  };

  const fields = normalizeField(RootFieldKey, selections, data) as Record<string, unknown>;
  storage[RootFieldKey] = { ...storage[RootFieldKey], ...fields };
};
