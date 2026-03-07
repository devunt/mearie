import type { CursorEntry, DependencyKey, FieldChange, Patch, Storage, Subscription, StalledInfo } from './types.ts';
import { isEntityLink, isEntityLinkArray, isEntityLinkArrayEqual, isNormalizedRecord } from './utils.ts';
import { EntityLinkKey } from './constants.ts';
import type { CursorRegistry } from './cursor.ts';
import { traceSelections } from './cursor.ts';
import { denormalize } from './denormalize.ts';
import { diffSnapshots, extractEntityKey, pathToKeyFn, type EntityArrayChange } from './diff.ts';

/**
 * @internal
 */
export const classifyChanges = (
  changes: FieldChange[],
): {
  structural: FieldChange[];
  scalar: FieldChange[];
} => {
  const structural: FieldChange[] = [];
  const scalar: FieldChange[] = [];

  for (const change of changes) {
    const { oldValue, newValue } = change;

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
      structural.push(change);
    } else {
      scalar.push(change);
    }
  }

  return { structural, scalar };
};

/**
 * @internal
 */
export const processScalarChanges = (
  changes: FieldChange[],
  registry: CursorRegistry,
  subscriptions: Map<number, Subscription>,
  storage: Storage,
): Map<number, Patch[]> => {
  const result = new Map<number, Patch[]>();

  for (const change of changes) {
    const entries = registry.get(change.depKey);
    if (!entries) continue;

    for (const entry of entries) {
      if (entry.dependency === 'transitive') continue;

      const sub = subscriptions.get(entry.subscriptionId);
      if (!sub) continue;

      let patchValue: unknown = change.newValue;
      const needsDenormalize =
        entry.selections &&
        (isNormalizedRecord(change.newValue) ||
          (Array.isArray(change.newValue) && change.newValue.some((v) => isNormalizedRecord(v))));
      if (needsDenormalize) {
        const mergedValue = storage[change.storageKey]?.[change.fieldKey] ?? change.newValue;
        const { data } = denormalize(entry.selections, {} as Storage, mergedValue, sub.variables);
        patchValue = data;
      }

      const patches = result.get(entry.subscriptionId) ?? [];
      patches.push({ type: 'set', path: entry.path, value: patchValue });
      result.set(entry.subscriptionId, patches);
    }
  }

  return result;
};

/**
 * @internal
 */
export const buildEntityArrayContext = (
  changes: FieldChange[],
  cursors: { depKey: DependencyKey; entry: CursorEntry }[],
): Map<string, EntityArrayChange> | undefined => {
  const result = new Map<string, EntityArrayChange>();

  for (const change of changes) {
    if (!isEntityLinkArray(change.oldValue) && !isEntityLinkArray(change.newValue)) continue;

    for (const { depKey, entry } of cursors) {
      if (depKey === change.depKey) {
        const oldArr = Array.isArray(change.oldValue) ? (change.oldValue as unknown[]) : [];
        const newArr = Array.isArray(change.newValue) ? (change.newValue as unknown[]) : [];
        const key = pathToKeyFn(entry.path);
        result.set(key, {
          oldKeys: oldArr.map((item) => extractEntityKey(item)),
          newKeys: newArr.map((item) => extractEntityKey(item)),
        });
        break;
      }
    }
  }

  return result.size > 0 ? result : undefined;
};

/**
 * @internal
 */
export const processStructuralChanges = (
  changes: FieldChange[],
  registry: CursorRegistry,
  subscriptions: Map<number, Subscription>,
  storage: Storage,
  stalled: Map<number, StalledInfo>,
): Map<number, Patch[]> => {
  const result = new Map<number, Patch[]>();
  const processedSubs = new Set<number>();

  for (const change of changes) {
    const entries = registry.get(change.depKey);
    if (!entries) continue;

    for (const entry of entries) {
      const subId = entry.subscriptionId;
      if (processedSubs.has(subId)) continue;

      const sub = subscriptions.get(subId);
      if (!sub) continue;

      processedSubs.add(subId);

      registry.removeAll(sub.cursors);

      const rootStorageKey = sub.entityKey ?? ('__root' as typeof import('./constants.ts').RootFieldKey);
      const rootValue = storage[rootStorageKey];
      if (!rootValue) continue;

      const traceResult = traceSelections(
        sub.artifact.selections,
        storage,
        rootValue,
        sub.variables,
        rootStorageKey,
        [],
        sub.id,
      );

      sub.cursors = new Set(traceResult.cursors.map((c) => c.entry));
      for (const { depKey, entry: cursorEntry } of traceResult.cursors) {
        registry.add(depKey, cursorEntry);
      }

      if (traceResult.complete) {
        stalled.delete(subId);

        const entityArrayChanges = buildEntityArrayContext(changes, traceResult.cursors);
        const patches = diffSnapshots(sub.data, traceResult.data, entityArrayChanges);
        sub.data = traceResult.data;
        if (patches.length > 0) {
          result.set(subId, patches);
        }
      } else {
        stalled.set(subId, { subscription: sub, missingDeps: traceResult.missingDeps });
      }
    }
  }

  return result;
};
