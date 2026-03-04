import { describe, it, expect } from 'vitest';
import {
  findCommonBounds,
  computeSwaps,
  extractEntityKey,
  computeEntityArrayPatches,
  diffSnapshots,
  pathToKeyFn,
  type EntityArrayChange,
} from './diff.ts';
import { applyPatchesImmutable } from './patch.ts';
import { EntityLinkKey } from './constants.ts';

describe('findCommonBounds', () => {
  it('should return full range for identical arrays', () => {
    const keys = ['A', 'B', 'C'];
    expect(findCommonBounds(keys, keys)).toEqual({ start: 3, oldEnd: 3, newEnd: 3 });
  });

  it('should find common prefix only', () => {
    expect(findCommonBounds(['A', 'B', 'C'], ['A', 'B', 'X'])).toEqual({ start: 2, oldEnd: 3, newEnd: 3 });
  });

  it('should find common suffix only', () => {
    expect(findCommonBounds(['X', 'B', 'C'], ['Y', 'B', 'C'])).toEqual({ start: 0, oldEnd: 1, newEnd: 1 });
  });

  it('should find both common prefix and suffix', () => {
    expect(findCommonBounds(['A', 'X', 'C'], ['A', 'Y', 'C'])).toEqual({ start: 1, oldEnd: 2, newEnd: 2 });
  });

  it('should handle no common elements', () => {
    expect(findCommonBounds(['A', 'B'], ['X', 'Y'])).toEqual({ start: 0, oldEnd: 2, newEnd: 2 });
  });

  it('should handle single element same', () => {
    expect(findCommonBounds(['A'], ['A'])).toEqual({ start: 1, oldEnd: 1, newEnd: 1 });
  });

  it('should handle single element different', () => {
    expect(findCommonBounds(['A'], ['B'])).toEqual({ start: 0, oldEnd: 1, newEnd: 1 });
  });

  it('should handle empty arrays', () => {
    expect(findCommonBounds([], [])).toEqual({ start: 0, oldEnd: 0, newEnd: 0 });
  });

  it('should handle null slots', () => {
    expect(findCommonBounds([null, 'A', null], [null, 'B', null])).toEqual({ start: 1, oldEnd: 2, newEnd: 2 });
  });

  it('should handle subset relationship (old shorter)', () => {
    expect(findCommonBounds(['A', 'B'], ['A', 'B', 'C'])).toEqual({ start: 2, oldEnd: 2, newEnd: 3 });
  });

  it('should handle subset relationship (new shorter)', () => {
    expect(findCommonBounds(['A', 'B', 'C'], ['A', 'B'])).toEqual({ start: 2, oldEnd: 3, newEnd: 2 });
  });

  it('should handle complete replacement with different sizes', () => {
    expect(findCommonBounds(['A', 'B', 'C'], ['X', 'Y'])).toEqual({ start: 0, oldEnd: 3, newEnd: 2 });
  });

  it('should handle empty vs non-empty arrays', () => {
    expect(findCommonBounds([], ['A'])).toEqual({ start: 0, oldEnd: 0, newEnd: 1 });
    expect(findCommonBounds(['A'], [])).toEqual({ start: 0, oldEnd: 1, newEnd: 0 });
  });
});

describe('extractEntityKey', () => {
  it('returns null for null input', () => {
    expect(extractEntityKey(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    const undef: unknown = void 0;
    expect(extractEntityKey(undef)).toBeNull();
  });

  it('returns null for number input', () => {
    expect(extractEntityKey(42)).toBeNull();
  });

  it('returns null for string input', () => {
    expect(extractEntityKey('hello')).toBeNull();
  });

  it('returns null for object without EntityLinkKey', () => {
    expect(extractEntityKey({ id: '1' })).toBeNull();
  });

  it('returns the key as string for object with EntityLinkKey', () => {
    expect(extractEntityKey({ [EntityLinkKey]: 'User:1' })).toBe('User:1');
  });

  it('coerces numeric EntityLinkKey value to string', () => {
    expect(extractEntityKey({ [EntityLinkKey]: 42 })).toBe('42');
  });
});

describe('computeSwaps', () => {
  const applySwaps = (keys: string[], swaps: { i: number; j: number }[]): string[] => {
    const result = [...keys];
    for (const { i, j } of swaps) {
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  };

  it('should return empty array for already sorted', () => {
    const result = computeSwaps(['A', 'B', 'C'], ['A', 'B', 'C']);
    expect(result).toEqual([]);
  });

  it('should swap two elements', () => {
    const old = ['A', 'B'];
    const target = ['B', 'A'];
    const swaps = computeSwaps(old, target);
    expect(swaps).toEqual([{ i: 0, j: 1 }]);
    expect(applySwaps(old, swaps)).toEqual(target);
  });

  it('should reverse a list', () => {
    const old = ['A', 'B', 'C'];
    const target = ['C', 'B', 'A'];
    const swaps = computeSwaps(old, target);
    expect(applySwaps(old, swaps)).toEqual(target);
  });

  it('should handle rotation', () => {
    const old = ['A', 'B', 'C'];
    const target = ['C', 'A', 'B'];
    const swaps = computeSwaps(old, target);
    expect(applySwaps(old, swaps)).toEqual(target);
  });

  it('should handle partial overlap', () => {
    const old = ['A', 'B', 'C', 'D'];
    const target = ['A', 'C', 'B', 'D'];
    const swaps = computeSwaps(old, target);
    expect(applySwaps(old, swaps)).toEqual(target);
  });

  it('should handle single element', () => {
    const result = computeSwaps(['A'], ['A']);
    expect(result).toEqual([]);
  });

  it('should handle empty arrays', () => {
    const result = computeSwaps([], []);
    expect(result).toEqual([]);
  });

  it('should handle duplicate keys using indexOf behavior', () => {
    const old = ['A', 'A', 'B'];
    const target = ['B', 'A', 'A'];
    const swaps = computeSwaps(old, target);
    expect(applySwaps(old, swaps)).toEqual(target);
  });

  it('should skip extra keys when newKeys is longer than oldKeys', () => {
    const old = ['A', 'B'];
    const target = ['B', 'A', 'C'];
    const swaps = computeSwaps(old, target);
    expect(swaps).toEqual([{ i: 0, j: 1 }]);
  });

  it('should end early when newKeys is shorter than oldKeys', () => {
    const old = ['A', 'B', 'C'];
    const target = ['B'];
    const swaps = computeSwaps(old, target);
    expect(swaps).toEqual([{ i: 0, j: 1 }]);
  });
});

describe('computeEntityArrayPatches', () => {
  it('returns no patches for empty old and new arrays', () => {
    const patches = computeEntityArrayPatches([], [], [], []);
    expect(patches).toEqual([]);
  });

  it('returns splice delete patch for single item deletion', () => {
    const oldValue = [{ [EntityLinkKey]: 'Post:1' }];
    const newValue: unknown[] = [];
    const patches = computeEntityArrayPatches(oldValue, newValue, ['posts'], []);
    expect(patches).toEqual([{ type: 'splice', path: ['posts'], index: 0, deleteCount: 1, items: [] }]);
  });

  it('returns splice insert patch for single item insertion', () => {
    const oldValue: unknown[] = [];
    const newValue = [{ [EntityLinkKey]: 'Post:1' }];
    const denormalized = [{ id: '1', title: 'First' }];
    const patches = computeEntityArrayPatches(oldValue, newValue, ['posts'], denormalized);
    expect(patches).toEqual([
      { type: 'splice', path: ['posts'], index: 0, deleteCount: 0, items: [{ id: '1', title: 'First' }] },
    ]);
  });

  it('returns swap patch for reordering two items', () => {
    const oldValue = [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }];
    const newValue = [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }];
    const denormalized = [{ id: '2' }, { id: '1' }];
    const patches = computeEntityArrayPatches(oldValue, newValue, ['posts'], denormalized);
    expect(patches).toContainEqual({ type: 'swap', path: ['posts'], i: 0, j: 1 });
  });

  it('returns splice delete and splice insert patches when no elements are retained', () => {
    const oldValue = [{ [EntityLinkKey]: 'Post:1' }];
    const newValue = [{ [EntityLinkKey]: 'Post:2' }];
    const denormalized = [{ id: '2', title: 'New' }];
    const patches = computeEntityArrayPatches(oldValue, newValue, ['posts'], denormalized);
    expect(patches).toContainEqual({ type: 'splice', path: ['posts'], index: 0, deleteCount: 1, items: [] });
    expect(patches).toContainEqual({
      type: 'splice',
      path: ['posts'],
      index: 0,
      deleteCount: 0,
      items: [{ id: '2', title: 'New' }],
    });
  });

  it('falls back to null for inserted items when denormalizedArray is out of bounds', () => {
    const oldValue: unknown[] = [];
    const newValue = [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }];
    const denormalized = [{ id: '1' }];
    const patches = computeEntityArrayPatches(oldValue, newValue, ['posts'], denormalized);
    const secondInsert = patches.find(
      (p): p is Extract<typeof p, { type: 'splice' }> => p.type === 'splice' && p.index === 1,
    );
    expect(secondInsert).toBeDefined();
    expect(secondInsert!.items[0]).toBeNull();
  });
});

describe('diffSnapshots', () => {
  it('returns empty patches for identical data', () => {
    const data = { name: 'Alice', age: 30 };
    expect(diffSnapshots(data, data)).toEqual([]);
  });

  it('generates set patch for scalar field change', () => {
    const oldData = { name: 'Alice' };
    const newData = { name: 'Bob' };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['name'], value: 'Bob' }]);
  });

  it('generates set patch for null to object transition', () => {
    const oldData = { user: null };
    const newData = { user: { name: 'Alice' } };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['user'], value: { name: 'Alice' } }]);
  });

  it('generates set patch for object to null transition', () => {
    const oldData = { user: { name: 'Alice' } };
    const newData = { user: null };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['user'], value: null }]);
  });

  it('recurses into nested objects', () => {
    const oldData = { user: { name: 'Alice', age: 30 } };
    const newData = { user: { name: 'Bob', age: 30 } };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['user', 'name'], value: 'Bob' }]);
  });

  it('generates set patch for non-entity array change', () => {
    const oldData = { tags: ['a', 'b'] };
    const newData = { tags: ['a', 'c'] };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['tags'], value: ['a', 'c'] }]);
  });

  it('skips __fragmentRef and __fragmentVars fields', () => {
    const oldData = { name: 'Alice', __fragmentRef: 'User:1', __fragmentVars: {} };
    const newData = { name: 'Bob', __fragmentRef: 'User:1', __fragmentVars: {} };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['name'], value: 'Bob' }]);
  });

  it('generates swap patch for entity array reorder', () => {
    const oldData = {
      posts: [
        { id: '1', title: 'First' },
        { id: '2', title: 'Second' },
      ],
    };
    const newData = {
      posts: [
        { id: '2', title: 'Second' },
        { id: '1', title: 'First' },
      ],
    };
    const entityArrayChanges = new Map<string, EntityArrayChange>([
      [
        pathToKeyFn(['posts']),
        {
          oldKeys: ['Post:1', 'Post:2'],
          newKeys: ['Post:2', 'Post:1'],
        },
      ],
    ]);

    const patches = diffSnapshots(oldData, newData, entityArrayChanges);

    expect(patches).toContainEqual({ type: 'swap', path: ['posts'], i: 0, j: 1 });
    const applied = applyPatchesImmutable(oldData, patches);
    expect(applied).toEqual(newData);
  });

  it('generates splice patch for entity array deletion', () => {
    const oldData = {
      posts: [
        { id: '1', title: 'First' },
        { id: '2', title: 'Second' },
        { id: '3', title: 'Third' },
      ],
    };
    const newData = {
      posts: [
        { id: '1', title: 'First' },
        { id: '3', title: 'Third' },
      ],
    };
    const entityArrayChanges = new Map<string, EntityArrayChange>([
      [
        pathToKeyFn(['posts']),
        {
          oldKeys: ['Post:1', 'Post:2', 'Post:3'],
          newKeys: ['Post:1', 'Post:3'],
        },
      ],
    ]);

    const patches = diffSnapshots(oldData, newData, entityArrayChanges);

    expect(patches).toContainEqual({ type: 'splice', path: ['posts'], index: 1, deleteCount: 1, items: [] });
    const applied = applyPatchesImmutable(oldData, patches);
    expect(applied).toEqual(newData);
  });

  it('generates splice patch for entity array insertion', () => {
    const oldData = {
      posts: [{ id: '1', title: 'First' }],
    };
    const newData = {
      posts: [
        { id: '1', title: 'First' },
        { id: '2', title: 'New' },
      ],
    };
    const entityArrayChanges = new Map<string, EntityArrayChange>([
      [
        pathToKeyFn(['posts']),
        {
          oldKeys: ['Post:1'],
          newKeys: ['Post:1', 'Post:2'],
        },
      ],
    ]);

    const patches = diffSnapshots(oldData, newData, entityArrayChanges);

    const splicePatch = patches.find(
      (p): p is Extract<typeof p, { type: 'splice' }> => p.type === 'splice' && p.index === 1,
    );
    expect(splicePatch).toBeDefined();
    expect(splicePatch!.deleteCount).toBe(0);
    expect(splicePatch!.items[0]).toEqual({ id: '2', title: 'New' });
  });

  it('generates swap + set patches for reorder with field change', () => {
    const oldData = {
      posts: [
        { id: '1', title: 'First', author: null },
        { id: '2', title: 'Second', author: { name: 'Alice' } },
      ],
    };
    const newData = {
      posts: [
        { id: '2', title: 'Second', author: { name: 'Alice' } },
        { id: '1', title: 'First', author: { name: 'Bob' } },
      ],
    };
    const entityArrayChanges = new Map<string, EntityArrayChange>([
      [
        pathToKeyFn(['posts']),
        {
          oldKeys: ['Post:1', 'Post:2'],
          newKeys: ['Post:2', 'Post:1'],
        },
      ],
    ]);

    const patches = diffSnapshots(oldData, newData, entityArrayChanges);

    expect(patches).toContainEqual({ type: 'swap', path: ['posts'], i: 0, j: 1 });
    const applied = applyPatchesImmutable(oldData, patches);
    expect(applied).toEqual(newData);
  });

  it('handles undefined old data gracefully', () => {
    const newData = { name: 'Alice' };
    const patches = diffSnapshots(undefined, newData);
    expect(patches).toEqual([{ type: 'set', path: [], value: newData }]);
  });

  it('handles multiple field changes in nested objects', () => {
    const oldData = { user: { name: 'Alice', age: 25, email: 'alice@test.com' } };
    const newData = { user: { name: 'Bob', age: 30, email: 'alice@test.com' } };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toHaveLength(2);
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'age'], value: 30 });
  });

  it('produces set patch with undefined value when new data is undefined', () => {
    const oldData = { name: 'Alice' };
    const undef: unknown = void 0;
    const patches = diffSnapshots(oldData, undef);
    expect(patches).toEqual([{ type: 'set', path: [], value: undef }]);
  });

  it('returns no patches when both old and new are undefined', () => {
    const undef: unknown = void 0;
    const patches = diffSnapshots(undef, undef);
    expect(patches).toEqual([]);
  });

  it('produces set patch when old is array and new is object', () => {
    const oldData = { field: [1, 2, 3] };
    const newData = { field: { a: 1 } };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['field'], value: { a: 1 } }]);
  });

  it('produces set patch when old is object and new is array', () => {
    const oldData = { field: { a: 1 } };
    const newData = { field: [1, 2, 3] };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['field'], value: [1, 2, 3] }]);
  });

  it('falls through to set patch when entityArrayChanges provided but path key is not in map', () => {
    const oldData = { tags: ['a', 'b'] };
    const newData = { tags: ['c', 'd'] };
    const entityArrayChanges = new Map<string, EntityArrayChange>([
      [
        pathToKeyFn(['posts']),
        {
          oldKeys: ['Post:1'],
          newKeys: ['Post:2'],
        },
      ],
    ]);
    const patches = diffSnapshots(oldData, newData, entityArrayChanges);
    expect(patches).toEqual([{ type: 'set', path: ['tags'], value: ['c', 'd'] }]);
  });

  it('patches new keys only and silently ignores old-only keys', () => {
    const oldData = { name: 'Alice', age: 30 };
    const newData = { name: 'Alice', email: 'alice@test.com' };
    const patches = diffSnapshots(oldData, newData);
    expect(patches).toEqual([{ type: 'set', path: ['email'], value: 'alice@test.com' }]);
  });
});

describe('pathToKeyFn', () => {
  it('returns empty string for empty path', () => {
    expect(pathToKeyFn([])).toBe('');
  });

  it('joins numeric segments with null character separator', () => {
    expect(pathToKeyFn(['posts', 0, 'comments'])).toBe('posts\u00000\u0000comments');
  });

  it('returns the segment itself for single segment path', () => {
    expect(pathToKeyFn(['name'])).toBe('name');
  });
});
