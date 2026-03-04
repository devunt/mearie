import type { DependencyKey, FieldChange, FieldValue, OptimisticEntry } from './types.ts';
import { parseDependencyKey } from './utils.ts';

/**
 * CoW optimistic stack that tracks field-level changes for rollback.
 * @internal
 */
export class OptimisticStack {
  #stack: OptimisticEntry[] = [];

  push(key: string, changes: Map<DependencyKey, { old: FieldValue; new: FieldValue }>): void {
    this.#stack.push({ key, changes });
  }

  has(key: string): boolean {
    return this.#stack.some((e) => e.key === key);
  }

  rollback(key: string): FieldChange[] {
    const idx = this.#stack.findIndex((e) => e.key === key);
    if (idx === -1) return [];

    const entry = this.#stack[idx]!;
    this.#stack.splice(idx, 1);

    const restorations: FieldChange[] = [];

    for (const [depKey, { old: oldVal, new: newVal }] of entry.changes) {
      const laterIdx = this.#stack.slice(idx).findIndex((later) => later.changes.has(depKey));
      if (laterIdx !== -1) {
        const later = this.#stack[idx + laterIdx]!;
        const laterChange = later.changes.get(depKey)!;
        laterChange.old = oldVal;
        continue;
      }

      const earlierEntry = this.#findClosestEarlier(depKey, idx);
      const restoreValue = earlierEntry === undefined ? oldVal : earlierEntry;

      const { storageKey, fieldKey } = parseDependencyKey(depKey);
      restorations.push({
        depKey,
        storageKey,
        fieldKey,
        oldValue: newVal,
        newValue: restoreValue,
      });
    }

    return restorations;
  }

  #findClosestEarlier(depKey: DependencyKey, beforeIdx: number): FieldValue | undefined {
    for (let i = beforeIdx - 1; i >= 0; i--) {
      const entry = this.#stack[i]!;
      if (entry.changes.has(depKey)) {
        return entry.changes.get(depKey)!.new;
      }
    }
    return undefined;
  }
}
