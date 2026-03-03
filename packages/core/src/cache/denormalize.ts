import type { Selection } from '@mearie/shared';
import { makeFieldKey, resolveArguments, isEntityLink, isNullish, mergeFields } from './utils.ts';
import { EntityLinkKey, RootFieldKey, FragmentRefKey, FragmentVarsKey } from './constants.ts';
import type { Storage, StorageKey, FieldKey, PropertyPath } from './types.ts';

const typenameFieldKey = makeFieldKey({ kind: 'Field', name: '__typename', type: 'String' }, {});

export const denormalize = (
  selections: readonly Selection[],
  storage: Storage,
  value: unknown,
  variables: Record<string, unknown>,
  accessor?: (
    storageKey: StorageKey,
    fieldKey: FieldKey,
    path: PropertyPath,
    selections?: readonly Selection[],
  ) => void,
  options?: { trackFragmentDeps?: boolean },
): { data: unknown; partial: boolean } => {
  let partial = false;

  const denormalizeField = (
    storageKey: StorageKey | null,
    selections: readonly Selection[],
    value: unknown,
    path: PropertyPath,
  ): unknown => {
    if (isNullish(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown, i: number) => denormalizeField(storageKey, selections, item, [...path, i]));
    }

    const data = value as Record<string, unknown>;

    if (isEntityLink(data)) {
      const entityKey = data[EntityLinkKey];
      const entity = storage[entityKey];

      if (!entity) {
        accessor?.(entityKey, typenameFieldKey, path);
        partial = true;

        return null;
      }

      return denormalizeField(entityKey, selections, entity, path);
    }

    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[fieldKey];
        const fieldPath = [...path, selection.alias ?? selection.name];

        if (storageKey !== null) {
          accessor?.(storageKey, fieldKey, fieldPath, selection.selections);
        }

        if (fieldValue === undefined) {
          partial = true;
          continue;
        }

        const name = selection.alias ?? selection.name;
        const resolvedValue = selection.selections
          ? denormalizeField(null, selection.selections, fieldValue, fieldPath)
          : fieldValue;

        if (name in fields) {
          mergeFields(fields, { [name]: resolvedValue }, true);
        } else {
          fields[name] = resolvedValue;
        }
      } else if (selection.kind === 'FragmentSpread') {
        if (storageKey !== null && storageKey !== RootFieldKey) {
          fields[FragmentRefKey] = storageKey;
          const merged = selection.args
            ? { ...variables, ...resolveArguments(selection.args, variables) }
            : { ...variables };
          const existing = fields[FragmentVarsKey] as Record<string, Record<string, unknown>> | undefined;
          fields[FragmentVarsKey] = { ...existing, [selection.name]: merged };

          if (accessor) {
            const inner = denormalize(
              selection.selections,
              storage,
              { [EntityLinkKey]: storageKey },
              variables,
              options?.trackFragmentDeps === false ? undefined : accessor,
              options,
            );

            if (inner.partial) {
              partial = true;
            }
          }
        } else if (storageKey === RootFieldKey) {
          fields[FragmentRefKey] = RootFieldKey;
          const merged = selection.args
            ? { ...variables, ...resolveArguments(selection.args, variables) }
            : { ...variables };
          const existing = fields[FragmentVarsKey] as Record<string, Record<string, unknown>> | undefined;
          fields[FragmentVarsKey] = { ...existing, [selection.name]: merged };

          if (accessor) {
            const inner = denormalize(
              selection.selections,
              storage,
              storage[RootFieldKey],
              variables,
              options?.trackFragmentDeps === false ? undefined : accessor,
              options,
            );

            if (inner.partial) {
              partial = true;
            }
          }
        } else {
          mergeFields(fields, denormalizeField(storageKey, selection.selections, value, path), true);
        }
      } else if (selection.kind === 'InlineFragment' && selection.on === data[typenameFieldKey]) {
        mergeFields(fields, denormalizeField(storageKey, selection.selections, value, path), true);
      }
    }

    return fields;
  };

  const data = denormalizeField(RootFieldKey, selections, value, []);

  return { data, partial };
};
