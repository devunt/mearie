import { describe, it, expect } from 'vitest';
import { stringify, deepAssign } from './utils.ts';

describe('stringify', () => {
  it('should stringify primitives', () => {
    expect(stringify(null)).toBe('null');
    expect(stringify(void 0)).toBe('undefined');
    expect(stringify(42)).toBe('42');
    expect(stringify(true)).toBe('true');
    expect(stringify('hello')).toBe('"hello"');
  });

  it('should stringify arrays', () => {
    expect(stringify([1, 2, 3])).toBe('[1,2,3]');
    expect(stringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('should stringify objects with sorted keys', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(stringify(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should handle nested objects', () => {
    const obj = {
      z: { b: 1, a: 2 },
      a: { y: 3, x: 4 },
    };
    expect(stringify(obj)).toBe('{"a":{"x":4,"y":3},"z":{"a":2,"b":1}}');
  });

  it('should exclude undefined values from objects', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    expect(stringify(obj)).toBe('{"a":1,"c":3}');
  });

  it('should exclude undefined values from nested objects', () => {
    const obj = {
      a: 1,
      b: { x: 10, y: undefined, z: 20 },
      c: undefined,
    };
    expect(stringify(obj)).toBe('{"a":1,"b":{"x":10,"z":20}}');
  });

  it('should handle objects with only undefined values', () => {
    const obj = { a: undefined, b: undefined };
    expect(stringify(obj)).toBe('{}');
  });

  it('should handle mixed null and undefined values', () => {
    const obj = { a: null, b: undefined, c: 0, d: false, e: '' };
    expect(stringify(obj)).toBe('{"a":null,"c":0,"d":false,"e":""}');
  });
});

describe('deepAssign', () => {
  it('should merge flat objects', () => {
    const target: Record<string, unknown> = { a: 1, b: 2 };
    deepAssign(target, { c: 3 });
    expect(target).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('should overwrite primitive values', () => {
    const target: Record<string, unknown> = { a: 1 };
    deepAssign(target, { a: 2 });
    expect(target).toEqual({ a: 2 });
  });

  it('should deep merge nested objects instead of overwriting', () => {
    const target: Record<string, unknown> = {
      me: { id: '1', name: 'Alice', email: 'alice@example.com' },
    };
    deepAssign(target, { me: { id: '1' } });
    expect(target).toEqual({
      me: { id: '1', name: 'Alice', email: 'alice@example.com' },
    });
  });

  it('should add new nested fields without removing existing ones', () => {
    const target: Record<string, unknown> = {
      me: { id: '1', name: 'Alice' },
    };
    deepAssign(target, { me: { id: '1', recentlyViewedEntities: [{ id: 'e1' }] } });
    expect(target).toEqual({
      me: { id: '1', name: 'Alice', recentlyViewedEntities: [{ id: 'e1' }] },
    });
  });

  it('should overwrite arrays (last-write-wins)', () => {
    const target: Record<string, unknown> = { items: [1, 2, 3] };
    deepAssign(target, { items: [4, 5] });
    expect(target).toEqual({ items: [4, 5] });
  });

  it('should overwrite null values', () => {
    const target: Record<string, unknown> = { me: { id: '1', name: 'Alice' } };
    deepAssign(target, { me: null } as Record<string, unknown>);
    expect(target).toEqual({ me: null });
  });

  it('should not deep merge when incoming is null', () => {
    const target: Record<string, unknown> = { user: { id: '1', name: 'Alice' } };
    deepAssign(target, { user: null } as Record<string, unknown>);
    expect(target.user).toBeNull();
  });

  it('should not deep merge when existing is null', () => {
    const target: Record<string, unknown> = { user: null };
    deepAssign(target, { user: { id: '1' } });
    expect(target).toEqual({ user: { id: '1' } });
  });

  it('should handle deeply nested merges', () => {
    const target: Record<string, unknown> = {
      a: { b: { c: { d: 1, e: 2 }, f: 3 }, g: 4 },
    };
    deepAssign(target, { a: { b: { c: { d: 10 } } } });
    expect(target).toEqual({
      a: { b: { c: { d: 10, e: 2 }, f: 3 }, g: 4 },
    });
  });

  it('should element-wise merge arrays of objects', () => {
    const target: Record<string, unknown> = {
      me: { sites: [{ id: '1', name: 'Site A', fonts: ['a', 'b'] }] },
    };
    deepAssign(target, { me: { sites: [{ id: '1' }] } });
    expect((target.me as Record<string, unknown>).sites).toEqual([{ id: '1', name: 'Site A', fonts: ['a', 'b'] }]);
  });

  it('should overwrite primitive arrays (last-write-wins)', () => {
    const target: Record<string, unknown> = { tags: ['a', 'b', 'c'] };
    deepAssign(target, { tags: ['x', 'y'] });
    expect(target.tags).toEqual(['x', 'y']);
  });

  it('should handle multiple successive merges', () => {
    const target: Record<string, unknown> = {
      me: { id: '1', name: 'Alice', email: 'alice@example.com', sites: [{ id: 's1' }] },
    };

    // Fragment 1: selects me { id }
    deepAssign(target, { impersonation: null });

    // Fragment 2: selects me { id }
    deepAssign(target, { me: { id: '1' } });

    // Fragment 3: selects me { id, recentlyViewedEntities } and notes
    deepAssign(target, { me: { id: '1', recentlyViewedEntities: [{ id: 'e1' }] }, notes: [{ id: 'n1' }] });

    expect(target).toEqual({
      me: {
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
        sites: [{ id: 's1' }],
        recentlyViewedEntities: [{ id: 'e1' }],
      },
      impersonation: null,
      notes: [{ id: 'n1' }],
    });
  });
});
