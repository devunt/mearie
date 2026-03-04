import type { Patch, PropertyPath } from './types.ts';
import { isEqual } from './utils.ts';
import { EntityLinkKey } from './constants.ts';

/**
 * Finds the common prefix and suffix boundaries between two key arrays.
 * @internal
 */
export const findCommonBounds = (
  oldKeys: (string | null)[],
  newKeys: (string | null)[],
): { start: number; oldEnd: number; newEnd: number } => {
  let start = 0;
  while (start < oldKeys.length && start < newKeys.length && oldKeys[start] === newKeys[start]) {
    start++;
  }

  let oldEnd = oldKeys.length;
  let newEnd = newKeys.length;
  while (oldEnd > start && newEnd > start && oldKeys[oldEnd - 1] === newKeys[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { start, oldEnd, newEnd };
};

/**
 * Computes swap operations to reorder oldKeys into newKeys order using selection sort.
 * @internal
 */
export const computeSwaps = (oldKeys: string[], newKeys: string[]): { i: number; j: number }[] => {
  const working = [...oldKeys];
  const swaps: { i: number; j: number }[] = [];

  for (const [i, newKey] of newKeys.entries()) {
    if (working[i] === newKey) continue;
    const j = working.indexOf(newKey, i + 1);
    if (j === -1) continue;
    [working[i], working[j]] = [working[j]!, working[i]!];
    swaps.push({ i, j });
  }

  return swaps;
};

/**
 * @internal
 */
export const extractEntityKey = (item: unknown): string | null => {
  if (item !== null && item !== undefined && typeof item === 'object' && EntityLinkKey in item) {
    return String((item as Record<string, unknown>)[EntityLinkKey]);
  }
  return null;
};

/**
 * @internal
 */
export const computeEntityArrayPatches = (
  oldValue: unknown[],
  newValue: unknown[],
  path: PropertyPath,
  denormalizedArray: unknown[],
): Patch[] => {
  const patches: Patch[] = [];

  const oldKeys = oldValue.map((item) => extractEntityKey(item));
  const newKeys = newValue.map((item) => extractEntityKey(item));

  const { start, oldEnd, newEnd } = findCommonBounds(oldKeys, newKeys);
  const oldMiddle = oldKeys.slice(start, oldEnd);
  const newMiddle = newKeys.slice(start, newEnd);
  const oldMiddleSet = new Set(oldMiddle.filter((k): k is string => k !== null));
  const newMiddleSet = new Set(newMiddle.filter((k): k is string => k !== null));

  for (let i = oldMiddle.length - 1; i >= 0; i--) {
    if (oldMiddle[i] !== null && !newMiddleSet.has(oldMiddle[i]!)) {
      patches.push({ type: 'splice', path, index: start + i, deleteCount: 1, items: [] });
    }
  }

  const retainedOld = oldMiddle.filter((k): k is string => k !== null && newMiddleSet.has(k));
  const retainedNew = newMiddle.filter((k): k is string => k !== null && oldMiddleSet.has(k));
  if (retainedOld.length > 0) {
    const swaps = computeSwaps(retainedOld, retainedNew);
    for (const { i, j } of swaps) {
      patches.push({ type: 'swap', path, i: start + i, j: start + j });
    }
  }

  const addedKeys = newMiddle.filter((k): k is string => k !== null && !oldMiddleSet.has(k));
  for (const key of addedKeys) {
    const idx = start + newMiddle.indexOf(key);
    const data = denormalizedArray[idx] ?? null;
    patches.push({ type: 'splice', path, index: idx, deleteCount: 0, items: [data] });
  }

  return patches;
};

/**
 * @internal
 */
export type EntityArrayChange = {
  oldKeys: (string | null)[];
  newKeys: (string | null)[];
};

const pathToKey = (path: PropertyPath): string => path.map(String).join('\0');

/**
 * Diffs two denormalized data snapshots to produce patches.
 * Handles entity link arrays with identity-aware splice/swap patches.
 * @internal
 */
export const diffSnapshots = (
  oldData: unknown,
  newData: unknown,
  entityArrayChanges?: Map<string, EntityArrayChange>,
): Patch[] => {
  const patches: Patch[] = [];

  const diff = (old: unknown, cur: unknown, path: PropertyPath): void => {
    if (isEqual(old, cur)) return;

    if (
      cur === null ||
      cur === undefined ||
      old === null ||
      old === undefined ||
      typeof cur !== 'object' ||
      typeof old !== 'object'
    ) {
      patches.push({ type: 'set', path, value: cur });
      return;
    }

    if (Array.isArray(cur)) {
      if (entityArrayChanges && Array.isArray(old)) {
        const key = pathToKey(path);
        const change = entityArrayChanges.get(key);
        if (change) {
          diffEntityArray(old, cur, path, change);
          return;
        }
      }
      patches.push({ type: 'set', path, value: cur });
      return;
    }

    if (Array.isArray(old)) {
      patches.push({ type: 'set', path, value: cur });
      return;
    }

    const oldObj = old as Record<string, unknown>;
    const curObj = cur as Record<string, unknown>;

    for (const key of Object.keys(curObj)) {
      if (key === '__fragmentRef' || key === '__fragmentVars') continue;
      diff(oldObj[key], curObj[key], [...path, key]);
    }
  };

  const diffEntityArray = (old: unknown[], cur: unknown[], path: PropertyPath, change: EntityArrayChange): void => {
    const { oldKeys, newKeys } = change;

    const oldByKey = new Map<string, unknown>();
    for (const [i, key] of oldKeys.entries()) {
      if (key) oldByKey.set(key, old[i]);
    }

    const arrayPatches = computeEntityArrayPatches(
      oldKeys.map((k) => (k ? { [EntityLinkKey]: k } : null)) as unknown[],
      newKeys.map((k) => (k ? { [EntityLinkKey]: k } : null)) as unknown[],
      path,
      cur,
    );
    patches.push(...arrayPatches);

    for (const [i, item] of cur.entries()) {
      const entityKey = newKeys[i];
      const matchedOld = entityKey ? oldByKey.get(entityKey) : undefined;
      diff(matchedOld, item, [...path, i]);
    }
  };

  diff(oldData, newData, []);
  return patches;
};

/**
 * @internal
 */
export const pathToKeyFn = pathToKey;
