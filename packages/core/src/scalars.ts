import type { Selection, VariableDef, SchemaMeta, FieldSelection } from '@mearie/shared';
import { isNullish, deepAssign } from './utils.ts';

export type ScalarTransformer<TExternal = unknown, TInternal = unknown> = {
  parse: (value: TInternal) => TExternal;
  serialize: (value: TExternal) => TInternal;
};

export type ScalarsConfig<TMeta extends SchemaMeta = SchemaMeta> = {
  [K in keyof TMeta['scalars']]: ScalarTransformer<TMeta['scalars'][K], unknown>;
};

export const parse = <TMeta extends SchemaMeta = SchemaMeta>(
  selections: readonly Selection[],
  scalars: ScalarsConfig<TMeta>,
  value: unknown,
): unknown => {
  const parseValue = (selection: FieldSelection, value: unknown): unknown => {
    if (isNullish(value)) {
      return value;
    }

    if (selection.array && Array.isArray(value)) {
      return value.map((item: unknown) => parseValue({ ...selection, array: false }, item));
    }

    if (selection.selections) {
      return parseField(selection.selections, value);
    }

    const transformer = scalars[selection.type];
    if (transformer) {
      return transformer.parse(value);
    }

    return value;
  };

  const parseField = (selections: readonly Selection[], value: unknown): unknown => {
    if (isNullish(value)) {
      return value;
    }

    const data = value as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const fieldName = selection.alias ?? selection.name;
        const fieldValue = data[fieldName];

        fields[fieldName] = parseValue(selection, fieldValue);
      } else if (
        selection.kind === 'FragmentSpread' ||
        (selection.kind === 'InlineFragment' && selection.on === data.__typename)
      ) {
        deepAssign(fields, parseField(selection.selections, value) as Record<string, unknown>);
      }
    }

    return fields;
  };

  return parseField(selections, value);
};

export const serialize = <TMeta extends SchemaMeta = SchemaMeta>(
  schemaMeta: TMeta,
  variableDefs: readonly VariableDef[],
  scalars: ScalarsConfig<TMeta>,
  variables: unknown,
): unknown => {
  const serializeValue = (variableDef: VariableDef, value: unknown): unknown => {
    if (isNullish(value)) {
      return value;
    }

    if (variableDef.array && Array.isArray(value)) {
      return value.map((item: unknown) => serializeValue({ ...variableDef, array: false }, item));
    }

    const input = schemaMeta.inputs[variableDef.type];
    if (input) {
      return serializeField(input.fields, value);
    }

    const transformer = scalars[variableDef.type];
    if (transformer) {
      return transformer.serialize(value as never);
    }

    return value;
  };

  const serializeField = (variableDefs: readonly VariableDef[], value: unknown): unknown => {
    if (isNullish(value)) {
      return value;
    }

    const data = value as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    for (const variableDef of variableDefs) {
      const variableValue = data[variableDef.name];
      fields[variableDef.name] = serializeValue(variableDef, variableValue);
    }

    return fields;
  };

  return serializeField(variableDefs, variables);
};
