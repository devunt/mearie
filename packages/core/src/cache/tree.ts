import type { Selection } from '@mearie/shared';
import type {
  DependencyKey,
  EntryTreeNode,
  FieldKey,
  PropertyPath,
  QuerySubscription,
  Storage,
  StorageKey,
  SubscriptionEntry,
} from './types.ts';
import { makeDependencyKey, parseDependencyKey } from './utils.ts';
import { denormalize } from './denormalize.ts';

export type EntryTuple = {
  storageKey: StorageKey;
  fieldKey: FieldKey;
  path: PropertyPath;
  selections: readonly Selection[] | undefined;
};

/**
 * @internal
 */
export const buildEntryTree = (tuples: EntryTuple[], rootDepKey?: DependencyKey): EntryTreeNode => {
  const root: EntryTreeNode = {
    depKey: (rootDepKey ?? '__root') as DependencyKey,
    children: new Map(),
  };

  for (const { storageKey, fieldKey, path, selections } of tuples) {
    let current = root;
    for (const element of path) {
      const key = String(element);
      let child = current.children.get(key);
      if (!child) {
        child = {
          depKey: '' as DependencyKey,
          children: new Map(),
        };
        current.children.set(key, child);
      }
      current = child;
    }
    current.depKey = makeDependencyKey(storageKey, fieldKey);
    if (selections) {
      current.selections = selections;
    }
  }

  return root;
};

/**
 * @internal
 */
export const findEntryTreeNode = (root: EntryTreeNode, path: PropertyPath): EntryTreeNode | undefined => {
  let current: EntryTreeNode | undefined = root;
  for (const segment of path) {
    if (!current) return undefined;
    current = current.children.get(String(segment));
  }
  return current;
};

/**
 * Removes all subscription entries for a given subscription from the subtree rooted at {@link node},
 * and clears the node's children map. Both the subscription entries and the tree structure
 * are cleaned up atomically to avoid stale references.
 * @internal
 */
export const removeSubtreeEntries = (
  node: EntryTreeNode,
  subscription: QuerySubscription,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
): void => {
  const entries = subscriptions.get(node.depKey);
  if (entries) {
    for (const entry of entries) {
      if (entry.subscription === subscription) {
        entries.delete(entry);
        break;
      }
    }
    if (entries.size === 0) {
      subscriptions.delete(node.depKey);
    }
  }

  for (const child of node.children.values()) {
    removeSubtreeEntries(child, subscription, subscriptions);
  }
  node.children.clear();
};

/**
 * @internal
 */
export const snapshotFields = (node: EntryTreeNode, storage: Storage): Map<string, unknown> => {
  const result = new Map<string, unknown>();
  for (const [fieldName, child] of node.children) {
    const { storageKey, fieldKey } = parseDependencyKey(child.depKey);
    const fields = storage[storageKey];
    if (fields) {
      result.set(fieldName, fields[fieldKey]);
    }
  }
  return result;
};

/**
 * @internal
 */
export const partialDenormalize = (
  node: EntryTreeNode,
  entity: Record<string, unknown>,
  basePath: PropertyPath,
  rebuiltDepKeys: Set<DependencyKey>,
  storage: Storage,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
  subscription: QuerySubscription,
): { data: unknown; fieldValues: Map<string, unknown> } => {
  if (!node.selections) {
    return { data: null, fieldValues: new Map() };
  }

  const tuples: EntryTuple[] = [];
  const { data } = denormalize(
    node.selections,
    storage,
    entity,
    subscription.variables,
    (storageKey, fieldKey, path, sels) => {
      tuples.push({
        storageKey,
        fieldKey,
        path: [...basePath, ...path],
        selections: sels,
      });
    },
    { trackFragmentDeps: false },
  );

  node.children.clear();
  const fieldValues = new Map<string, unknown>();

  for (const tuple of tuples) {
    const depKey = makeDependencyKey(tuple.storageKey, tuple.fieldKey);
    rebuiltDepKeys.add(depKey);

    const relativePath = tuple.path.slice(basePath.length);
    let current = node;
    for (const element of relativePath) {
      const key = String(element);
      let child = current.children.get(key);
      if (!child) {
        child = {
          depKey: '' as DependencyKey,
          children: new Map(),
        };
        current.children.set(key, child);
      }
      current = child;
    }
    current.depKey = depKey;
    if (tuple.selections) {
      current.selections = tuple.selections;
    }

    const entry: SubscriptionEntry = {
      path: tuple.path,
      subscription,
    };
    let entrySet = subscriptions.get(depKey);
    if (!entrySet) {
      entrySet = new Set();
      subscriptions.set(depKey, entrySet);
    }
    entrySet.add(entry);

    if (relativePath.length === 1) {
      const fieldName = String(relativePath[0]);
      if (data && typeof data === 'object') {
        fieldValues.set(fieldName, (data as Record<string, unknown>)[fieldName]);
      }
    }
  }

  return { data, fieldValues };
};

const updateSubtreePaths = (
  node: EntryTreeNode,
  basePath: PropertyPath,
  newIndex: number,
  baseLen: number,
  subscription: QuerySubscription,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
): void => {
  const entries = subscriptions.get(node.depKey);
  if (entries) {
    for (const entry of entries) {
      if (entry.subscription === subscription && entry.path.length > baseLen) {
        entry.path = [...basePath, newIndex, ...entry.path.slice(baseLen + 1)];
      }
    }
  }

  for (const child of node.children.values()) {
    updateSubtreePaths(child, basePath, newIndex, baseLen, subscription, subscriptions);
  }
};

/**
 * @internal
 */
export const rebuildArrayIndices = (
  node: EntryTreeNode,
  entry: SubscriptionEntry,
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
): void => {
  const basePath = entry.path;
  const baseLen = basePath.length;

  const children = [...node.children.entries()].toSorted(([a], [b]) => Number(a) - Number(b));
  node.children.clear();

  for (const [newIdx, child_] of children.entries()) {
    const [, child] = child_;
    const newKey = String(newIdx);
    node.children.set(newKey, child);

    updateSubtreePaths(child, basePath, newIdx, baseLen, entry.subscription, subscriptions);
  }
};
