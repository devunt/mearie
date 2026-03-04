import { describe, it, expect } from 'vitest';
import { OptimisticStack } from './optimistic.ts';
import type { DependencyKey, FieldValue } from './types.ts';

const dk = (storageKey: string, fieldName: string): DependencyKey => `${storageKey}.${fieldName}@{}` as DependencyKey;

type ChangeEntry = [DependencyKey, { old: FieldValue; new: FieldValue }];

describe('OptimisticStack', () => {
  it('records field changes', () => {
    const stack = new OptimisticStack();
    const changes = new Map<DependencyKey, { old: FieldValue; new: FieldValue }>([
      [dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }],
    ] satisfies ChangeEntry[]);

    stack.push('mutation-1', changes);

    expect(stack.has('mutation-1')).toBe(true);
  });

  it('has returns false for unknown key', () => {
    const stack = new OptimisticStack();
    expect(stack.has('unknown')).toBe(false);
  });

  it('rollback restores old values for single entry', () => {
    const stack = new OptimisticStack();
    const changes = new Map<DependencyKey, { old: FieldValue; new: FieldValue }>([
      [dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }],
    ] satisfies ChangeEntry[]);

    stack.push('mutation-1', changes);

    const restorations = stack.rollback('mutation-1');
    expect(restorations).toHaveLength(1);
    expect(restorations[0]).toMatchObject({
      depKey: dk('User:1', 'name'),
      oldValue: 'Bob',
      newValue: 'Alice',
    });
    expect(stack.has('mutation-1')).toBe(false);
  });

  it('rollback skips fields overwritten by later entries', () => {
    const stack = new OptimisticStack();

    const pushEntries = (entries: [string, ChangeEntry[]][]) => {
      for (const [key, changes] of entries) {
        stack.push(key, new Map<DependencyKey, { old: FieldValue; new: FieldValue }>(changes));
      }
    };

    pushEntries([
      ['A', [[dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }]]],
      ['B', [[dk('User:1', 'name'), { old: 'Bob', new: 'Charlie' }]]],
    ]);

    const restorationsA = stack.rollback('A');
    expect(restorationsA).toHaveLength(0);

    const restorationsB = stack.rollback('B');
    expect(restorationsB).toHaveLength(1);
    expect(restorationsB[0]).toMatchObject({
      depKey: dk('User:1', 'name'),
      newValue: 'Alice',
    });
  });

  it('rollback returns correct values with earlier entry still active', () => {
    const stack = new OptimisticStack();

    const pushEntries = (entries: [string, ChangeEntry[]][]) => {
      for (const [key, changes] of entries) {
        stack.push(key, new Map<DependencyKey, { old: FieldValue; new: FieldValue }>(changes));
      }
    };

    pushEntries([
      [
        'A',
        [
          [dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }],
          [dk('User:1', 'age'), { old: 25, new: 30 }],
        ],
      ],
      ['B', [[dk('User:1', 'name'), { old: 'Bob', new: 'Charlie' }]]],
    ]);

    const restorationsB = stack.rollback('B');
    expect(restorationsB).toHaveLength(1);
    expect(restorationsB[0]).toMatchObject({
      depKey: dk('User:1', 'name'),
      newValue: 'Bob',
    });
  });

  it('rollback of non-existent key returns empty', () => {
    const stack = new OptimisticStack();
    const restorations = stack.rollback('nonexistent');
    expect(restorations).toHaveLength(0);
  });

  it('multiple fields across entries', () => {
    const stack = new OptimisticStack();

    stack.push(
      'A',
      new Map<DependencyKey, { old: FieldValue; new: FieldValue }>([
        [dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }],
        [dk('User:1', 'email'), { old: 'alice@test.com', new: 'bob@test.com' }],
      ] satisfies ChangeEntry[]),
    );

    const restorations = stack.rollback('A');
    expect(restorations).toHaveLength(2);
  });

  it('three-layer rollback with shared and unique fields', () => {
    const stack = new OptimisticStack();

    const pushEntries = (entries: [string, ChangeEntry[]][]) => {
      for (const [key, changes] of entries) {
        stack.push(key, new Map<DependencyKey, { old: FieldValue; new: FieldValue }>(changes));
      }
    };

    pushEntries([
      ['A', [[dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }]]],
      [
        'B',
        [
          [dk('User:1', 'name'), { old: 'Bob', new: 'Charlie' }],
          [dk('User:1', 'email'), { old: 'a@x', new: 'b@x' }],
        ],
      ],
      ['C', [[dk('User:1', 'name'), { old: 'Charlie', new: 'Dave' }]]],
    ]);

    const restorationsB = stack.rollback('B');
    expect(restorationsB).toHaveLength(1);
    expect(restorationsB[0]).toMatchObject({
      depKey: dk('User:1', 'email'),
      oldValue: 'b@x',
      newValue: 'a@x',
    });

    const restorationsC = stack.rollback('C');
    expect(restorationsC).toHaveLength(1);
    expect(restorationsC[0]).toMatchObject({
      depKey: dk('User:1', 'name'),
      oldValue: 'Dave',
      newValue: 'Bob',
    });
  });

  it('same key pushed twice', () => {
    const stack = new OptimisticStack();

    stack.push(
      'mutation-1',
      new Map<DependencyKey, { old: FieldValue; new: FieldValue }>([
        [dk('User:1', 'name'), { old: 'Alice', new: 'Bob' }],
      ] satisfies ChangeEntry[]),
    );
    expect(stack.has('mutation-1')).toBe(true);

    stack.push(
      'mutation-1',
      new Map<DependencyKey, { old: FieldValue; new: FieldValue }>([
        [dk('User:1', 'email'), { old: 'a@x', new: 'b@x' }],
      ] satisfies ChangeEntry[]),
    );

    const firstRollback = stack.rollback('mutation-1');
    expect(firstRollback).toHaveLength(1);
    expect(firstRollback[0]).toMatchObject({
      depKey: dk('User:1', 'name'),
      oldValue: 'Bob',
      newValue: 'Alice',
    });

    expect(stack.has('mutation-1')).toBe(true);

    const secondRollback = stack.rollback('mutation-1');
    expect(secondRollback).toHaveLength(1);
    expect(secondRollback[0]).toMatchObject({
      depKey: dk('User:1', 'email'),
      oldValue: 'b@x',
      newValue: 'a@x',
    });

    expect(stack.has('mutation-1')).toBe(false);
  });

  it('push with empty changes map', () => {
    const stack = new OptimisticStack();

    stack.push('empty-op', new Map());

    expect(stack.has('empty-op')).toBe(true);

    const restorations = stack.rollback('empty-op');
    expect(restorations).toHaveLength(0);

    expect(stack.has('empty-op')).toBe(false);
  });
});
