import type { Patch, PropertyPath } from './types.ts';

type PathNode = Record<string | number, unknown>;

const copyNode = (node: unknown): PathNode =>
  Array.isArray(node) ? ([...(node as unknown[])] as unknown as PathNode) : { ...(node as PathNode) };

const shallowCopyPath = (root: unknown, path: PropertyPath): unknown => {
  if (path.length === 0) return root;

  let result = copyNode(root);
  const top: unknown = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    result[key] = copyNode(result[key]);
    result = result[key] as PathNode;
  }

  return top;
};

/**
 * Sets a value at a nested path within an object.
 * @param obj - The object to modify.
 * @param path - The path to the target location.
 * @param value - The value to set.
 */
export const setPath = (obj: unknown, path: PropertyPath, value: unknown): void => {
  let current = obj as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]!] as Record<string | number, unknown>;
  }
  current[path.at(-1)!] = value;
};

/**
 * Gets a value at a nested path within an object.
 * @param obj - The object to read from.
 * @param path - The path to the target location.
 * @returns The value at the path, or the object itself if path is empty.
 */
export const getPath = (obj: unknown, path: PropertyPath): unknown => {
  let current: Record<string | number, unknown> | null | undefined = obj as Record<string | number, unknown>;
  for (const segment of path) {
    if (current === undefined || current === null) return undefined;
    current = current[segment] as Record<string | number, unknown> | null | undefined;
  }
  return current;
};

/**
 * Applies cache patches to data immutably, shallow-copying only along changed paths.
 */
export const applyPatchesImmutable = <T>(data: T, patches: Patch[]): T => {
  if (patches.length === 0) return data;

  let result: unknown = data;

  for (const patch of patches) {
    if (patch.type === 'set') {
      if (patch.path.length === 0) {
        result = patch.value;
        continue;
      }

      result = shallowCopyPath(result, patch.path);
      let target = result as PathNode;
      for (let i = 0; i < patch.path.length - 1; i++) {
        target = target[patch.path[i]!] as PathNode;
      }
      target[patch.path.at(-1)!] = patch.value;
    } else if (patch.type === 'splice') {
      result = shallowCopyPath(result, patch.path);
      let target = result as PathNode;
      for (const segment of patch.path) {
        target = target[segment] as PathNode;
      }
      const arr = [...(target as unknown as unknown[])];
      arr.splice(patch.index, patch.deleteCount, ...patch.items);
      let parent = result as PathNode;
      for (let i = 0; i < patch.path.length - 1; i++) {
        parent = parent[patch.path[i]!] as PathNode;
      }
      parent[patch.path.at(-1)!] = arr;
    } else if (patch.type === 'swap') {
      result = shallowCopyPath(result, patch.path);
      let target = result as PathNode;
      for (const segment of patch.path) {
        target = target[segment] as PathNode;
      }
      const arr = [...(target as unknown as unknown[])];
      [arr[patch.i], arr[patch.j]] = [arr[patch.j], arr[patch.i]];
      let parent = result as PathNode;
      for (let i = 0; i < patch.path.length - 1; i++) {
        parent = parent[patch.path[i]!] as PathNode;
      }
      parent[patch.path.at(-1)!] = arr;
    }
  }

  return result as T;
};

/**
 * Applies cache patches to a mutable target object in place.
 * @param target - The mutable object to apply patches to.
 * @param patches - The patches to apply.
 * @returns The new root value if a root-level set patch was applied, otherwise undefined.
 */
export const applyPatchesMutable = (target: unknown, patches: Patch[]): unknown => {
  let root: unknown;
  for (const patch of patches) {
    if (patch.type === 'set') {
      if (patch.path.length === 0) {
        root = patch.value;
      } else {
        setPath(target, patch.path, patch.value);
      }
    } else if (patch.type === 'splice') {
      const arr = getPath(target, patch.path) as unknown[];
      arr.splice(patch.index, patch.deleteCount, ...patch.items);
    } else if (patch.type === 'swap') {
      const arr = getPath(target, patch.path) as unknown[];
      [arr[patch.i], arr[patch.j]] = [arr[patch.j], arr[patch.i]];
    }
  }
  return root;
};
