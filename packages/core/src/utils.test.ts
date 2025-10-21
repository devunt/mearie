import { describe, it, expect } from 'vitest';
import { stringify } from './utils.ts';

describe('stableStringify', () => {
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
