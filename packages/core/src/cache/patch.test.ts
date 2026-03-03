import { describe, it, expect } from 'vitest';
import { applyPatchesImmutable, applyPatchesMutable, setPath, getPath } from './patch.ts';

describe('applyPatchesImmutable', () => {
  describe('set patch', () => {
    it('updates a single field', () => {
      const data = { name: 'Alice', age: 30 };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['name'], value: 'Bob' }]);
      expect(result).toEqual({ name: 'Bob', age: 30 });
      expect(result).not.toBe(data);
    });

    it('preserves sibling references', () => {
      const sibling = { x: 1 };
      const data = { a: sibling, b: 'old' };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['b'], value: 'new' }]);
      expect(result.a).toBe(sibling);
    });

    it('handles deep path', () => {
      const deep = { val: 'original' };
      const data = { a: { b: { c: deep } } };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['a', 'b', 'c', 'val'], value: 'updated' }]);
      expect(result.a.b.c.val).toBe('updated');
      expect(result).not.toBe(data);
      expect(result.a).not.toBe(data.a);
      expect(result.a.b).not.toBe(data.a.b);
      expect(result.a.b.c).not.toBe(data.a.b.c);
    });

    it('sets null value', () => {
      const data = { user: { name: 'Alice' } };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['user'], value: null }]);
      expect(result).toEqual({ user: null });
    });

    it('updates field inside array item', () => {
      const item0 = { name: 'a' };
      const item1 = { name: 'b' };
      const data = { items: [item0, item1] };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['items', 0, 'name'], value: 'A' }]);
      expect(result.items[0]!.name).toBe('A');
      expect(result.items[0]).not.toBe(item0);
      expect(result.items[1]).toBe(item1);
    });

    it('replaces entire data with empty path', () => {
      const data = { name: 'Alice' };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: [], value: { name: 'Bob' } }]);
      expect(result).toEqual({ name: 'Bob' });
    });

    it('sets root level field', () => {
      const data = { name: 'Alice' };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['name'], value: 'Bob' }]);
      expect(result).toEqual({ name: 'Bob' });
    });
  });

  describe('splice patch', () => {
    it('removes an item', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 1, deleteCount: 1, items: [] },
      ]);
      expect(result.items).toEqual(['a', 'c']);
      expect(result).not.toBe(data);
    });

    it('inserts an item', () => {
      const data = { items: ['a', 'c'] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 1, deleteCount: 0, items: ['b'] },
      ]);
      expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('replaces an item', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 0, deleteCount: 1, items: ['A'] },
      ]);
      expect(result.items).toEqual(['A', 'b', 'c']);
    });

    it('handles nested array splice', () => {
      const data = { posts: [{ tags: ['ts', 'js'] }] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['posts', 0, 'tags'], index: 2, deleteCount: 0, items: ['rust'] },
      ]);
      expect(result.posts[0]!.tags).toEqual(['ts', 'js', 'rust']);
    });

    it('deletes multiple items', () => {
      const data = { items: ['a', 'b', 'c', 'd'] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 1, deleteCount: 2, items: [] },
      ]);
      expect(result.items).toEqual(['a', 'd']);
    });

    it('inserts into empty array', () => {
      const data = { items: [] as string[] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 0, deleteCount: 0, items: ['a'] },
      ]);
      expect(result.items).toEqual(['a']);
    });
  });

  describe('swap patch', () => {
    it('swaps two elements', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = applyPatchesImmutable(data, [{ type: 'swap', path: ['items'], i: 0, j: 2 }]);
      expect(result.items).toEqual(['c', 'b', 'a']);
    });

    it('preserves unchanged element references', () => {
      const obj0 = { id: 0 };
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const data = { items: [obj0, obj1, obj2] };
      const result = applyPatchesImmutable(data, [{ type: 'swap', path: ['items'], i: 0, j: 2 }]);
      expect(result.items[1]).toBe(obj1);
    });

    it('handles adjacent swap', () => {
      const data = { items: ['a', 'b'] };
      const result = applyPatchesImmutable(data, [{ type: 'swap', path: ['items'], i: 0, j: 1 }]);
      expect(result.items).toEqual(['b', 'a']);
    });

    it('same index swap is no-op', () => {
      const data = { items: ['a', 'b'] };
      const result = applyPatchesImmutable(data, [{ type: 'swap', path: ['items'], i: 0, j: 0 }]);
      expect(result.items).toEqual(['a', 'b']);
    });

    it('handles nested array swap', () => {
      const data = { outer: { items: ['x', 'y', 'z'] } };
      const result = applyPatchesImmutable(data, [{ type: 'swap', path: ['outer', 'items'], i: 0, j: 2 }]);
      expect(result.outer.items).toEqual(['z', 'y', 'x']);
    });
  });

  describe('composite', () => {
    it('applies set + splice sequentially', () => {
      const data = { name: 'Alice', items: ['a', 'b', 'c'] };
      const result = applyPatchesImmutable(data, [
        { type: 'set', path: ['name'], value: 'Bob' },
        { type: 'splice', path: ['items'], index: 2, deleteCount: 0, items: ['d'] },
      ]);
      expect(result.name).toBe('Bob');
      expect(result.items).toEqual(['a', 'b', 'd', 'c']);
    });

    it('applies splice + swap', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = applyPatchesImmutable(data, [
        { type: 'splice', path: ['items'], index: 3, deleteCount: 0, items: ['d'] },
        { type: 'swap', path: ['items'], i: 0, j: 3 },
      ]);
      expect(result.items).toEqual(['d', 'b', 'c', 'a']);
    });

    it('last set on same path wins', () => {
      const data = { name: 'Alice' };
      const result = applyPatchesImmutable(data, [
        { type: 'set', path: ['name'], value: 'Bob' },
        { type: 'set', path: ['name'], value: 'Charlie' },
      ]);
      expect(result.name).toBe('Charlie');
    });

    it('independent paths preserve untouched references', () => {
      const a = { val: 1 };
      const b = { val: 2 };
      const data = { a, b };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['a', 'val'], value: 10 }]);
      expect(result.b).toBe(b);
      expect(result.a).not.toBe(a);
    });
  });

  describe('edge cases', () => {
    it('empty patches returns same reference', () => {
      const data = { name: 'Alice' };
      const result = applyPatchesImmutable(data, []);
      expect(result).toBe(data);
    });

    it('handles deeply nested path (5+ levels)', () => {
      const data = { a: { b: { c: { d: { e: 'old' } } } } };
      const result = applyPatchesImmutable(data, [{ type: 'set', path: ['a', 'b', 'c', 'd', 'e'], value: 'new' }]);
      expect(result.a.b.c.d.e).toBe('new');
    });

    it('applies patches to undefined data via root-level set', () => {
      const result = applyPatchesImmutable(undefined, [{ type: 'set', path: [], value: { name: 'Bob' } }]);
      expect(result).toEqual({ name: 'Bob' });
    });
  });
});

describe('applyPatchesMutable', () => {
  describe('set patch', () => {
    it('updates a single field in place', () => {
      const obj = { name: 'Alice', age: 30 };
      applyPatchesMutable(obj, [{ type: 'set', path: ['name'], value: 'Bob' }]);
      expect(obj).toEqual({ name: 'Bob', age: 30 });
    });

    it('mutates the original object', () => {
      const obj = { name: 'Alice' };
      applyPatchesMutable(obj, [{ type: 'set', path: ['name'], value: 'Bob' }]);
      expect(obj.name).toBe('Bob');
    });

    it('handles deep path', () => {
      const obj = { a: { b: { c: { val: 'original' } } } };
      applyPatchesMutable(obj, [{ type: 'set', path: ['a', 'b', 'c', 'val'], value: 'updated' }]);
      expect(obj.a.b.c.val).toBe('updated');
    });

    it('sets null value', () => {
      const obj: { user: { name: string } | null } = { user: { name: 'Alice' } };
      applyPatchesMutable(obj, [{ type: 'set', path: ['user'], value: null }]);
      expect(obj).toEqual({ user: null });
    });

    it('updates field inside array item', () => {
      const obj = { items: [{ name: 'a' }, { name: 'b' }] };
      applyPatchesMutable(obj, [{ type: 'set', path: ['items', 0, 'name'], value: 'A' }]);
      expect(obj.items[0]!.name).toBe('A');
      expect(obj.items[1]!.name).toBe('b');
    });

    it('returns new root on root-level set', () => {
      const obj = { name: 'Alice' };
      const root = applyPatchesMutable(obj, [{ type: 'set', path: [], value: { name: 'Bob' } }]);
      expect(root).toEqual({ name: 'Bob' });
      expect(obj.name).toBe('Alice');
    });

    it('returns undefined when no root-level set', () => {
      const obj = { name: 'Alice' };
      const root = applyPatchesMutable(obj, [{ type: 'set', path: ['name'], value: 'Bob' }]);
      expect(root).toBeUndefined();
    });

    it('preserves nested object references on sibling update', () => {
      const nested = { x: 1 };
      const obj = { a: nested, b: 'old' };
      applyPatchesMutable(obj, [{ type: 'set', path: ['b'], value: 'new' }]);
      expect(obj.a).toBe(nested);
    });

    it('handles deeply nested path (5+ levels)', () => {
      const obj = { a: { b: { c: { d: { e: 'old' } } } } };
      applyPatchesMutable(obj, [{ type: 'set', path: ['a', 'b', 'c', 'd', 'e'], value: 'new' }]);
      expect(obj.a.b.c.d.e).toBe('new');
    });
  });

  describe('splice patch', () => {
    it('removes an item', () => {
      const obj = { items: ['a', 'b', 'c'] };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 1, deleteCount: 1, items: [] }]);
      expect(obj.items).toEqual(['a', 'c']);
    });

    it('inserts an item', () => {
      const obj = { items: ['a', 'c'] };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 1, deleteCount: 0, items: ['b'] }]);
      expect(obj.items).toEqual(['a', 'b', 'c']);
    });

    it('replaces an item', () => {
      const obj = { items: ['a', 'b', 'c'] };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 0, deleteCount: 1, items: ['A'] }]);
      expect(obj.items).toEqual(['A', 'b', 'c']);
    });

    it('handles nested array splice', () => {
      const obj = { posts: [{ tags: ['ts', 'js'] }] };
      applyPatchesMutable(obj, [
        { type: 'splice', path: ['posts', 0, 'tags'], index: 2, deleteCount: 0, items: ['rust'] },
      ]);
      expect(obj.posts[0]!.tags).toEqual(['ts', 'js', 'rust']);
    });

    it('deletes multiple items', () => {
      const obj = { items: ['a', 'b', 'c', 'd'] };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 1, deleteCount: 2, items: [] }]);
      expect(obj.items).toEqual(['a', 'd']);
    });

    it('inserts into empty array', () => {
      const obj = { items: [] as string[] };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 0, deleteCount: 0, items: ['a'] }]);
      expect(obj.items).toEqual(['a']);
    });

    it('mutates the same array reference', () => {
      const arr = ['a', 'b', 'c'];
      const obj = { items: arr };
      applyPatchesMutable(obj, [{ type: 'splice', path: ['items'], index: 1, deleteCount: 1, items: [] }]);
      expect(obj.items).toBe(arr);
      expect(arr).toEqual(['a', 'c']);
    });
  });

  describe('swap patch', () => {
    it('swaps two elements', () => {
      const obj = { items: ['a', 'b', 'c'] };
      applyPatchesMutable(obj, [{ type: 'swap', path: ['items'], i: 0, j: 2 }]);
      expect(obj.items).toEqual(['c', 'b', 'a']);
    });

    it('handles adjacent swap', () => {
      const obj = { items: ['a', 'b'] };
      applyPatchesMutable(obj, [{ type: 'swap', path: ['items'], i: 0, j: 1 }]);
      expect(obj.items).toEqual(['b', 'a']);
    });

    it('same index swap is no-op', () => {
      const obj = { items: ['a', 'b'] };
      applyPatchesMutable(obj, [{ type: 'swap', path: ['items'], i: 0, j: 0 }]);
      expect(obj.items).toEqual(['a', 'b']);
    });

    it('handles nested array swap', () => {
      const obj = { outer: { items: ['x', 'y', 'z'] } };
      applyPatchesMutable(obj, [{ type: 'swap', path: ['outer', 'items'], i: 0, j: 2 }]);
      expect(obj.outer.items).toEqual(['z', 'y', 'x']);
    });

    it('preserves element references', () => {
      const obj0 = { id: 0 };
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const data = { items: [obj0, obj1, obj2] };
      applyPatchesMutable(data, [{ type: 'swap', path: ['items'], i: 0, j: 2 }]);
      expect(data.items[0]).toBe(obj2);
      expect(data.items[1]).toBe(obj1);
      expect(data.items[2]).toBe(obj0);
    });

    it('mutates the same array reference', () => {
      const arr = ['a', 'b', 'c'];
      const obj = { items: arr };
      applyPatchesMutable(obj, [{ type: 'swap', path: ['items'], i: 0, j: 2 }]);
      expect(obj.items).toBe(arr);
    });
  });

  describe('composite', () => {
    it('applies set + splice sequentially', () => {
      const obj = { name: 'Alice', items: ['a', 'b', 'c'] };
      applyPatchesMutable(obj, [
        { type: 'set', path: ['name'], value: 'Bob' },
        { type: 'splice', path: ['items'], index: 2, deleteCount: 0, items: ['d'] },
      ]);
      expect(obj.name).toBe('Bob');
      expect(obj.items).toEqual(['a', 'b', 'd', 'c']);
    });

    it('applies splice + swap', () => {
      const obj = { items: ['a', 'b', 'c'] };
      applyPatchesMutable(obj, [
        { type: 'splice', path: ['items'], index: 3, deleteCount: 0, items: ['d'] },
        { type: 'swap', path: ['items'], i: 0, j: 3 },
      ]);
      expect(obj.items).toEqual(['d', 'b', 'c', 'a']);
    });

    it('last set on same path wins', () => {
      const obj = { name: 'Alice' };
      applyPatchesMutable(obj, [
        { type: 'set', path: ['name'], value: 'Bob' },
        { type: 'set', path: ['name'], value: 'Charlie' },
      ]);
      expect(obj.name).toBe('Charlie');
    });

    it('root-level set returns last root value', () => {
      const obj = { a: 1 };
      const root = applyPatchesMutable(obj, [
        { type: 'set', path: [], value: { a: 2 } },
        { type: 'set', path: [], value: { a: 3 } },
      ]);
      expect(root).toEqual({ a: 3 });
    });

    it('mixes root-level set with field-level patches', () => {
      const obj = { name: 'Alice', items: ['a'] };
      const root = applyPatchesMutable(obj, [
        { type: 'splice', path: ['items'], index: 1, deleteCount: 0, items: ['b'] },
        { type: 'set', path: [], value: { replaced: true } },
      ]);
      expect(obj.items).toEqual(['a', 'b']);
      expect(root).toEqual({ replaced: true });
    });
  });

  describe('edge cases', () => {
    it('empty patches returns undefined and does not mutate', () => {
      const obj = { name: 'Alice' };
      const root = applyPatchesMutable(obj, []);
      expect(root).toBeUndefined();
      expect(obj).toEqual({ name: 'Alice' });
    });
  });
});

describe('setPath', () => {
  it('should set a value at single depth', () => {
    const obj = { a: 1 };
    setPath(obj, ['a'], 2);
    expect(obj.a).toBe(2);
  });

  it('should set a value in nested object', () => {
    const obj = { a: { b: 1 } };
    setPath(obj, ['a', 'b'], 2);
    expect(obj.a.b).toBe(2);
  });

  it('should set a value at array index', () => {
    const obj = { items: [10, 20, 30] };
    setPath(obj, ['items', 1], 99);
    expect(obj.items[1]).toBe(99);
  });

  it('should set a value in mixed path (object + array)', () => {
    const obj = { a: { items: [{ name: 'old' }] } };
    setPath(obj, ['a', 'items', 0, 'name'], 'new');
    expect(obj.a.items[0]!.name).toBe('new');
  });
});

describe('getPath', () => {
  it('should get a value at single depth', () => {
    expect(getPath({ a: 1 }, ['a'])).toBe(1);
  });

  it('should get a value from nested object', () => {
    expect(getPath({ a: { b: 2 } }, ['a', 'b'])).toBe(2);
  });

  it('should get a value at array index', () => {
    expect(getPath({ items: [10, 20, 30] }, ['items', 1])).toBe(20);
  });

  it('should return obj itself for empty path', () => {
    const obj = { a: 1 };
    expect(getPath(obj, [])).toBe(obj);
  });

  it('should return undefined for non-existent middle path', () => {
    expect(getPath({ a: { b: 1 } }, ['x', 'y'])).toBeUndefined();
  });
});
