import type { Selection } from '@mearie/shared';
import { makeFieldKey, isEntityLink, isNullish } from './utils.ts';
import { EntityLinkKey, RootFieldKey, FragmentRefKey } from './constants.ts';
import type { Storage, StorageKey, FieldKey } from './types.ts';

const typenameFieldKey = makeFieldKey({ kind: 'Field', name: '__typename', type: 'String' }, {});

export const denormalize = (
  selections: readonly Selection[],
  storage: Storage,
  value: unknown,
  variables: Record<string, unknown>,
  accessor?: (storageKey: StorageKey, fieldKey: FieldKey) => void,
): { data: unknown; partial: boolean } => {
  let partial = false;

  const denormalizeField = (
    storageKey: StorageKey | null,
    selections: readonly Selection[],
    value: unknown,
  ): unknown => {
    if (isNullish(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => denormalizeField(storageKey, selections, item));
    }

    const data = value as Record<string, unknown>;

    if (isEntityLink(data)) {
      const entityKey = data[EntityLinkKey];
      const entity = storage[entityKey];

      if (!entity) {
        accessor?.(entityKey, typenameFieldKey);
        partial = true;

        return null;
      }

      return denormalizeField(entityKey, selections, entity);
    }

    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[fieldKey];

        if (storageKey !== null) {
          accessor?.(storageKey, fieldKey);
        }

        if (fieldValue === undefined) {
          partial = true;
          continue;
        }

        fields[selection.alias ?? selection.name] = selection.selections
          ? denormalizeField(null, selection.selections, fieldValue)
          : fieldValue;
      } else if (selection.kind === 'FragmentSpread') {
        if (storageKey !== null && storageKey !== RootFieldKey) {
          fields[FragmentRefKey] = storageKey;
        } else {
          Object.assign(fields, denormalizeField(storageKey, selection.selections, value));
        }
      } else if (selection.kind === 'InlineFragment' && selection.on === data[typenameFieldKey]) {
        Object.assign(fields, denormalizeField(storageKey, selection.selections, value));
      }
    }

    return fields;
  };

  const data = denormalizeField(RootFieldKey, selections, value);

  return { data, partial };
};
