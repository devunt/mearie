import type { Selection } from '@mearie/shared';
import type { CursorEntry, DependencyKey, PropertyPath, Storage, StorageKey } from './types.ts';
import { makeFieldKey, makeDependencyKey, resolveArguments, isEntityLink, isNullish, mergeFields } from './utils.ts';
import { EntityLinkKey, RootFieldKey, FragmentRefKey, FragmentVarsKey } from './constants.ts';

/**
 * Reverse index mapping dependency keys to cursor entries.
 * @internal
 */
export class CursorRegistry {
  #index = new Map<DependencyKey, Set<CursorEntry>>();

  add(depKey: DependencyKey, entry: CursorEntry): void {
    let set = this.#index.get(depKey);
    if (!set) {
      set = new Set();
      this.#index.set(depKey, set);
    }
    set.add(entry);
  }

  get(depKey: DependencyKey): Set<CursorEntry> | undefined {
    return this.#index.get(depKey);
  }

  remove(depKey: DependencyKey, entry: CursorEntry): void {
    const set = this.#index.get(depKey);
    if (set) {
      set.delete(entry);
      if (set.size === 0) {
        this.#index.delete(depKey);
      }
    }
  }

  removeAll(cursors: Set<CursorEntry>): void {
    for (const [depKey, set] of this.#index) {
      for (const cursor of cursors) {
        if (set.has(cursor)) {
          set.delete(cursor);
        }
      }
      if (set.size === 0) {
        this.#index.delete(depKey);
      }
    }
  }

  forEachByPrefix(prefix: string, callback: (entry: CursorEntry) => void): void {
    for (const [depKey, set] of this.#index) {
      if ((depKey as string).startsWith(prefix)) {
        for (const entry of set) {
          callback(entry);
        }
      }
    }
  }

  clear(): void {
    this.#index.clear();
  }
}

/**
 * Result of tracing selections against the storage.
 * @internal
 */
export type TraceResult = {
  complete: boolean;
  cursors: { depKey: DependencyKey; entry: CursorEntry }[];
  missingDeps: Set<DependencyKey>;
  data: unknown;
};

const typenameFieldKey = makeFieldKey({ kind: 'Field', name: '__typename', type: 'String' }, {});

/**
 * Walks selections against storage to produce cursor entries, check completeness,
 * and build denormalized data.
 * @internal
 */
export const traceSelections = (
  selections: readonly Selection[],
  storage: Storage,
  value: Record<string, unknown>,
  variables: Record<string, unknown>,
  storageKey: StorageKey,
  basePath: PropertyPath,
  subscriptionId: number,
): TraceResult => {
  const cursors: { depKey: DependencyKey; entry: CursorEntry }[] = [];
  const missingDeps = new Set<DependencyKey>();
  let complete = true;

  const traceField = (
    sk: StorageKey | null,
    sels: readonly Selection[],
    val: unknown,
    path: PropertyPath,
    trackCursors: boolean,
  ): unknown => {
    if (isNullish(val)) {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item: unknown, i: number) => traceField(sk, sels, item, [...path, i], trackCursors));
    }

    const data = val as Record<string, unknown>;

    if (isEntityLink(data)) {
      const entityKey = data[EntityLinkKey];
      const entity = storage[entityKey];

      if (!entity) {
        if (trackCursors) {
          const depKey = makeDependencyKey(entityKey, typenameFieldKey);
          missingDeps.add(depKey);
        }
        complete = false;
        return null;
      }

      return traceField(entityKey, sels, entity, path, trackCursors);
    }

    const fields: Record<string, unknown> = {};

    for (const selection of sels) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables);
        const fieldValue = data[fieldKey];
        const fieldPath = [...path, selection.alias ?? selection.name];

        if (sk !== null && trackCursors) {
          const depKey = makeDependencyKey(sk, fieldKey);
          const entry: CursorEntry = {
            subscriptionId,
            path: fieldPath,
            ...(selection.selections && { selections: selection.selections }),
          };
          cursors.push({ depKey, entry });
        }

        if (fieldValue === undefined) {
          if (sk !== null) {
            const depKey = makeDependencyKey(sk, fieldKey);
            missingDeps.add(depKey);
          }
          complete = false;
          continue;
        }

        const name = selection.alias ?? selection.name;
        const resolvedValue = selection.selections
          ? traceField(null, selection.selections, fieldValue, fieldPath, trackCursors)
          : fieldValue;

        if (name in fields) {
          mergeFields(fields, { [name]: resolvedValue }, true);
        } else {
          fields[name] = resolvedValue;
        }
      } else if (selection.kind === 'FragmentSpread') {
        if (sk !== null && sk !== RootFieldKey) {
          fields[FragmentRefKey] = sk;
          const merged = selection.args
            ? { ...variables, ...resolveArguments(selection.args, variables) }
            : { ...variables };
          const existing = fields[FragmentVarsKey] as Record<string, Record<string, unknown>> | undefined;
          fields[FragmentVarsKey] = { ...existing, [selection.name]: merged };

          const inner = traceSelections(
            selection.selections,
            storage,
            storage[sk] as Record<string, unknown>,
            variables,
            sk,
            path,
            subscriptionId,
          );
          if (!inner.complete) {
            complete = false;
            for (const dep of inner.missingDeps) {
              missingDeps.add(dep);
            }
          }
        } else if (sk === RootFieldKey) {
          fields[FragmentRefKey] = RootFieldKey;
          const merged = selection.args
            ? { ...variables, ...resolveArguments(selection.args, variables) }
            : { ...variables };
          const existing = fields[FragmentVarsKey] as Record<string, Record<string, unknown>> | undefined;
          fields[FragmentVarsKey] = { ...existing, [selection.name]: merged };

          const inner = traceSelections(
            selection.selections,
            storage,
            storage[RootFieldKey],
            variables,
            RootFieldKey,
            path,
            subscriptionId,
          );
          if (!inner.complete) {
            complete = false;
            for (const dep of inner.missingDeps) {
              missingDeps.add(dep);
            }
          }
        } else {
          mergeFields(fields, traceField(sk, selection.selections, val, path, trackCursors), true);
        }
      } else if (selection.kind === 'InlineFragment' && selection.on === data[typenameFieldKey]) {
        mergeFields(fields, traceField(sk, selection.selections, val, path, trackCursors), true);
      }
    }

    return fields;
  };

  const data = traceField(storageKey, selections, value, basePath, true);

  return { complete, cursors, missingDeps, data };
};
