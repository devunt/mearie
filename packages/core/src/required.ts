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

const validateRequiredInner = (
  selections: readonly Selection[],
  data: unknown,
  fieldPath: string[],
  validatedMap?: WeakMap<object, Set<string>>,
): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item, index) => {
      const result = validateRequiredInner(selections, item, [...fieldPath, `[${index}]`], validatedMap);
      return result === CASCADE_NULL ? null : result;
    });
  }

  const obj = data as Record<string, unknown>;
  validatedMap ??= new WeakMap();

  let validated = validatedMap.get(obj);
  if (!validated) {
    validated = new Set<string>();
    validatedMap.set(obj, validated);
  }

  for (const selection of selections) {
    if (selection.kind === 'Field') {
      const fieldName = selection.alias ?? selection.name;
      if (!(fieldName in obj)) continue;

      const fieldValue = obj[fieldName];
      const action = getRequiredAction(selection.directives);

      if (selection.selections) {
        if (action && fieldValue === null) {
          if (action === 'THROW') {
            throw new RequiredFieldError(fieldPath, fieldName);
          } else if (action === 'CASCADE') {
            return CASCADE_NULL;
          }
        }

        if (fieldValue !== null && fieldValue !== undefined) {
          const result = validateRequiredInner(
            selection.selections,
            fieldValue,
            [...fieldPath, fieldName],
            validatedMap,
          );

          if (result === CASCADE_NULL) {
            const isEffectivelyNullable = selection.nullable && !getRequiredAction(selection.directives);
            if (isEffectivelyNullable) {
              obj[fieldName] = null;
            } else {
              return CASCADE_NULL;
            }
          }
        }
      } else {
        if (validated.has(fieldName)) continue;
        validated.add(fieldName);

        if (action && fieldValue === null) {
          if (action === 'THROW') {
            throw new RequiredFieldError(fieldPath, fieldName);
          } else if (action === 'CASCADE') {
            return CASCADE_NULL;
          }
        }
      }
    } else if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
      const result = validateRequiredInner(selection.selections, data, fieldPath, validatedMap);

      if (result === CASCADE_NULL) {
        return CASCADE_NULL;
      }
    }
  }

  return data;
};

const validateRequired = (selections: readonly Selection[], data?: unknown, fieldPath: string[] = []): unknown => {
  const result = validateRequiredInner(selections, data, fieldPath);
  return result === CASCADE_NULL ? null : result;
};

export { validateRequired, RequiredFieldError };
export type { RequiredAction };
