import type { Selection, Directive } from '@mearie/shared';

type RequiredAction = 'THROW' | 'CASCADE';

const CASCADE_NULL: unique symbol = Symbol('CASCADE_NULL');

class RequiredFieldError extends Error {
  public fieldPath: string[];
  public fieldName: string;

  constructor(fieldPath: string[], fieldName: string) {
    super(`Required field '${fieldPath.join('.')}.${fieldName}' is null`);
    this.name = 'RequiredFieldError';
    this.fieldPath = fieldPath;
    this.fieldName = fieldName;
  }
}

const getRequiredAction = (directives?: Directive[]): RequiredAction | null => {
  if (!directives) return null;

  const requiredDirective = directives.find((d) => d.name === 'required');
  if (!requiredDirective) return null;

  const action = requiredDirective.args?.action;
  if (action === 'CASCADE') return 'CASCADE';
  return 'THROW';
};

const validateRequiredInner = (selections: readonly Selection[], data: unknown, fieldPath: string[]): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item, index) => {
      const result = validateRequiredInner(selections, item, [...fieldPath, `[${index}]`]);
      return result === CASCADE_NULL ? null : result;
    });
  }

  const result: Record<string, unknown> = {};

  for (const selection of selections) {
    if (selection.kind === 'Field') {
      const fieldName = selection.alias ?? selection.name;
      const fieldValue = (data as Record<string, unknown>)[fieldName];

      const action = getRequiredAction(selection.directives);

      if (action && fieldValue === null) {
        if (action === 'THROW') {
          throw new RequiredFieldError(fieldPath, fieldName);
        } else if (action === 'CASCADE') {
          return CASCADE_NULL;
        }
      }

      if (selection.selections && fieldValue !== null && fieldValue !== undefined) {
        const validated = validateRequiredInner(selection.selections, fieldValue, [...fieldPath, fieldName]);

        if (validated === CASCADE_NULL) {
          const isEffectivelyNullable = selection.nullable && !getRequiredAction(selection.directives);
          if (isEffectivelyNullable) {
            result[fieldName] = null;
          } else {
            return CASCADE_NULL;
          }
        } else {
          result[fieldName] = validated;
        }
      } else {
        result[fieldName] = fieldValue;
      }
    } else if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
      const fragmentResult = validateRequiredInner(selection.selections, data, fieldPath);

      if (fragmentResult === CASCADE_NULL) {
        return CASCADE_NULL;
      }

      Object.assign(result, fragmentResult as Record<string, unknown>);
    }
  }

  return result;
};

const validateRequired = (selections: readonly Selection[], data: unknown, fieldPath: string[] = []): unknown => {
  const result = validateRequiredInner(selections, data, fieldPath);
  return result === CASCADE_NULL ? null : result;
};

export { validateRequired, RequiredFieldError };
export type { RequiredAction };
