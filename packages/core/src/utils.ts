/**
 * Stable JSON serialization with sorted keys.
 * Used for both variables and field arguments.
 * @internal
 * @param value - The value to stringify.
 * @returns The stable JSON string.
 */
export const stableStringify = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;

  if (type === 'string') return JSON.stringify(value as string);
  if (type === 'number' || type === 'boolean') return String(value as number | boolean);

  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }

  if (type === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).toSorted();
    const pairs = keys.map((k) => `"${k}":${stableStringify(obj[k])}`);
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(value) ?? '';
};

/**
 * Hash a string using FNV-1a algorithm.
 * @internal
 * @param str - The string to hash.
 * @returns The hash value.
 */
export const hashString = (str: string): number => {
  const FNV_OFFSET = 0x81_1c_9d_c5;
  const FNV_PRIME = 0x01_00_01_93;

  let hash = FNV_OFFSET;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.codePointAt(i) ?? 0;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};

/**
 * Combine two hashes using FNV-1a algorithm.
 * Used for query key generation.
 * @internal
 * @param hash1 - The first hash.
 * @param hash2 - The second hash.
 * @returns The combined hash.
 */
export const combineHashes = (hash1: number, hash2: number): number => {
  const FNV_PRIME = 0x01_00_01_93;
  let hash = hash1;

  for (let i = 0; i < 4; i++) {
    hash ^= (hash2 >> (i * 8)) & 0xff;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};
