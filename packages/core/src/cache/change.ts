import type {
  DependencyKey,
  EntryTreeNode,
  Patch,
  QuerySubscription,
  Storage,
  StorageKey,
  SubscriptionEntry,
} from './types.ts';
import {
  isEntityLink,
  isEntityLinkArray,
  isEntityLinkArrayEqual,
  isEqual,
  isNullish,
  isNormalizedRecord,
} from './utils.ts';
import { EntityLinkKey } from './constants.ts';
import { findCommonBounds, computeSwaps } from './diff.ts';
import {
  findEntryTreeNode,
  removeSubtreeEntries,
  snapshotFields,
  partialDenormalize,
  rebuildArrayIndices,
} from './tree.ts';
import { denormalize } from './denormalize.ts';

/**
 * @internal
 */
export const classifyChanges = (
  changedKeys: Map<DependencyKey, { oldValue: unknown; newValue: unknown }>,
): {
  structural: { depKey: DependencyKey; oldValue: unknown; newValue: unknown }[];
  scalar: { depKey: DependencyKey; newValue: unknown }[];
} => {
  const structural: { depKey: DependencyKey; oldValue: unknown; newValue: unknown }[] = [];
  const scalar: { depKey: DependencyKey; newValue: unknown }[] = [];

  for (const [depKey, { oldValue, newValue }] of changedKeys) {
    if (isEntityLink(oldValue) && isEntityLink(newValue) && oldValue[EntityLinkKey] === newValue[EntityLinkKey]) {
      continue;
    }

    if (
      isEntityLinkArray(oldValue) &&
      isEntityLinkArray(newValue) &&
      isEntityLinkArrayEqual(oldValue as unknown[], newValue as unknown[])
    ) {
      continue;
    }

    if (
      isEntityLink(oldValue) ||
      isEntityLink(newValue) ||
      isEntityLinkArray(oldValue) ||
      isEntityLinkArray(newValue)
    ) {
      structural.push({ depKey, oldValue, newValue });
    } else {
      scalar.push({ depKey, newValue });
    }
  }

  return { structural, scalar };
};

/**
 * @internal
 */
const processStructuralChange = (
  entry: SubscriptionEntry,
  node: EntryTreeNode,
  oldValue: unknown,
  newValue: unknown,
  rebuiltDepKeys: Set<DependencyKey>,
  storage: Storage,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
): Patch[] => {
  const patches: Patch[] = [];

  if (isEntityLink(oldValue) || isEntityLink(newValue)) {
    if (isNullish(newValue)) {
      removeSubtreeEntries(node, entry.subscription, subscriptions);
      patches.push({ type: 'set', path: entry.path, value: null });
      return patches;
    }

    if (isNullish(oldValue)) {
      const newEntityKey = (newValue as Record<string, unknown>)[EntityLinkKey] as string;
      const entity = storage[newEntityKey as StorageKey];
      if (entity) {
        const { data } = partialDenormalize(
          node,
          entity as Record<string, unknown>,
          entry.path,
          rebuiltDepKeys,
          storage,
          subscriptions,
          entry.subscription,
        );
        patches.push({ type: 'set', path: entry.path, value: data });
      } else {
        patches.push({ type: 'set', path: entry.path, value: null });
      }
      return patches;
    }

    const oldFields = snapshotFields(node, storage);
    removeSubtreeEntries(node, entry.subscription, subscriptions);

    const newEntityKey = (newValue as Record<string, unknown>)[EntityLinkKey] as string;
    const newEntity = storage[newEntityKey as StorageKey];
    if (!newEntity) {
      patches.push({ type: 'set', path: entry.path, value: null });
      return patches;
    }

    const { fieldValues: newFields } = partialDenormalize(
      node,
      newEntity as Record<string, unknown>,
      entry.path,
      rebuiltDepKeys,
      storage,
      subscriptions,
      entry.subscription,
    );

    for (const [fieldName, newVal] of newFields) {
      const oldVal = oldFields.get(fieldName);
      if (!isEqual(oldVal, newVal)) {
        patches.push({ type: 'set', path: [...entry.path, fieldName], value: newVal });
      }
    }
    for (const [fieldName] of oldFields) {
      if (!newFields.has(fieldName)) {
        patches.push({ type: 'set', path: [...entry.path, fieldName], value: null });
      }
    }
    return patches;
  }

  if (isEntityLinkArray(oldValue) || isEntityLinkArray(newValue)) {
    const oldArr = (Array.isArray(oldValue) ? oldValue : []) as unknown[];
    const newArr = (Array.isArray(newValue) ? newValue : []) as unknown[];
    const oldKeys = oldArr.map((item: unknown) =>
      item !== null && item !== undefined && typeof item === 'object' && EntityLinkKey in item
        ? ((item as Record<string, unknown>)[EntityLinkKey] as string)
        : null,
    );
    const newKeys = newArr.map((item: unknown) =>
      item !== null && item !== undefined && typeof item === 'object' && EntityLinkKey in item
        ? ((item as Record<string, unknown>)[EntityLinkKey] as string)
        : null,
    );

    const { start, oldEnd, newEnd } = findCommonBounds(oldKeys, newKeys);
    const oldMiddle = oldKeys.slice(start, oldEnd);
    const newMiddle = newKeys.slice(start, newEnd);

    const newMiddleSet = new Set(newMiddle.filter((k): k is string => k !== null));
    const oldMiddleSet = new Set(oldMiddle.filter((k): k is string => k !== null));

    const removedIndices: number[] = [];
    for (let i = oldMiddle.length - 1; i >= 0; i--) {
      const key = oldMiddle[i]!;
      if (key !== null && !newMiddleSet.has(key)) {
        removedIndices.push(start + i);
      }
    }

    for (const idx of removedIndices) {
      const childKey = String(idx);
      const child = node.children.get(childKey);
      if (child) {
        removeSubtreeEntries(child, entry.subscription, subscriptions);
        node.children.delete(childKey);
      }
      patches.push({ type: 'splice', path: entry.path, index: idx, deleteCount: 1, items: [] });
    }

    compactChildren(node);

    const retainedOld = oldMiddle.filter((k): k is string => k !== null && newMiddleSet.has(k));
    const retainedNew = newMiddle.filter((k): k is string => k !== null && oldMiddleSet.has(k));

    if (retainedOld.length > 0) {
      const swaps = computeSwaps(retainedOld, retainedNew);
      for (const { i, j } of swaps) {
        const absI = start + i;
        const absJ = start + j;
        patches.push({ type: 'swap', path: entry.path, i: absI, j: absJ });

        const childI = node.children.get(String(absI));
        const childJ = node.children.get(String(absJ));
        if (childI && childJ) {
          node.children.set(String(absI), childJ);
          node.children.set(String(absJ), childI);
        }
      }
    }

    const siblingSelections = findSiblingSelections(node);
    const addedKeys = newMiddle.filter((k): k is string => k !== null && !oldMiddleSet.has(k));
    for (const key of addedKeys) {
      const idx = start + newMiddle.indexOf(key);
      shiftChildrenRight(node, idx);

      const entity = storage[key as StorageKey];
      const insertNode: EntryTreeNode = {
        depKey: '' as DependencyKey,
        children: new Map(),
        ...(siblingSelections && { selections: siblingSelections }),
      };

      if (entity) {
        const { data } = partialDenormalize(
          insertNode,
          entity as Record<string, unknown>,
          [...entry.path, idx],
          rebuiltDepKeys,
          storage,
          subscriptions,
          entry.subscription,
        );
        node.children.set(String(idx), insertNode);
        patches.push({ type: 'splice', path: entry.path, index: idx, deleteCount: 0, items: [data] });
      } else {
        node.children.set(String(idx), insertNode);
        patches.push({ type: 'splice', path: entry.path, index: idx, deleteCount: 0, items: [null] });
      }
    }

    rebuildArrayIndices(node, entry, subscriptions);

    return patches;
  }

  return patches;
};

const compactChildren = (node: EntryTreeNode): void => {
  const sorted = [...node.children.entries()].toSorted(([a], [b]) => Number(a) - Number(b));
  node.children.clear();
  for (const [i, element] of sorted.entries()) {
    node.children.set(String(i), element[1]);
  }
};

const findSiblingSelections = (node: EntryTreeNode): EntryTreeNode['selections'] => {
  for (const child of node.children.values()) {
    if (child.selections) {
      return child.selections;
    }
  }
  return node.selections;
};

const shiftChildrenRight = (node: EntryTreeNode, fromIndex: number): void => {
  const entries = [...node.children.entries()].toSorted(([a], [b]) => Number(a) - Number(b));
  node.children.clear();
  for (const [key, child] of entries) {
    const idx = Number(key);
    if (idx >= fromIndex) {
      node.children.set(String(idx + 1), child);
    } else {
      node.children.set(key, child);
    }
  }
};

/**
 * @internal
 */
export const generatePatches = (
  changedKeys: Map<DependencyKey, { oldValue: unknown; newValue: unknown }>,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
  storage: Storage,
): Map<QuerySubscription, Patch[]> => {
  const patchesBySubscription = new Map<QuerySubscription, Patch[]>();
  const rebuiltDepKeys = new Set<DependencyKey>();

  const { structural, scalar } = classifyChanges(changedKeys);

  for (const { depKey, oldValue, newValue } of structural) {
    const entries = subscriptions.get(depKey);
    if (!entries) continue;
    for (const entry of entries) {
      const node = findEntryTreeNode(entry.subscription.entryTree, entry.path);
      if (!node) continue;
      const patches = processStructuralChange(entry, node, oldValue, newValue, rebuiltDepKeys, storage, subscriptions);
      if (patches.length > 0) {
        const existing = patchesBySubscription.get(entry.subscription) ?? [];
        existing.push(...patches);
        patchesBySubscription.set(entry.subscription, existing);
      }
    }
  }

  for (const { depKey, newValue } of scalar) {
    if (rebuiltDepKeys.has(depKey)) continue;
    const entries = subscriptions.get(depKey);
    if (!entries) continue;
    for (const entry of entries) {
      let patchValue = newValue;
      const node = findEntryTreeNode(entry.subscription.entryTree, entry.path);
      if (node?.selections && isNormalizedRecord(newValue)) {
        const { data } = denormalize(node.selections, storage, newValue, entry.subscription.variables);
        patchValue = data;
      }
      const existing = patchesBySubscription.get(entry.subscription) ?? [];
      existing.push({ type: 'set', path: entry.path, value: patchValue });
      patchesBySubscription.set(entry.subscription, existing);
    }
  }

  return patchesBySubscription;
};
