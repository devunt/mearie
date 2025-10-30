/**
 * Stable JSON serialization with sorted keys.
 * Used for both variables and field arguments.
 * @internal
 * @param value - The value to stringify.
 * @returns The stable JSON string.
 */
export const stringify = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;

  if (type === 'string') return JSON.stringify(value as string);
  if (type === 'number' || type === 'boolean') return String(value as number | boolean);

  if (Array.isArray(value)) {
    return '[' + value.map((v) => stringify(v)).join(',') + ']';
  }

  if (type === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).toSorted();
    const pairs = keys.filter((k) => obj[k] !== undefined).map((k) => `"${k}":${stringify(obj[k])}`);
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(value) ?? '';
};

/**
 * Type guard to check if a value is nullish.
 * @internal
 * @param value - Value to check.
 * @returns True if the value is nullish.
 */
export const isNullish = (value: unknown): value is null | undefined => {
  return value === undefined || value === null;
};
