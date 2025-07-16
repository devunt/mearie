import { describe, it, expect } from 'vitest';
import { stableStringify, hashString, combineHashes } from './utils.ts';

describe('stableStringify', () => {
  it('should stringify primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(void 0)).toBe('undefined');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('should stringify arrays', () => {
    expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
    expect(stableStringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('should stringify objects with sorted keys', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(stableStringify(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should handle nested objects', () => {
    const obj = {
      z: { b: 1, a: 2 },
      a: { y: 3, x: 4 },
    };
    expect(stableStringify(obj)).toBe('{"a":{"x":4,"y":3},"z":{"a":2,"b":1}}');
  });
});

describe('hashString', () => {
  it('should generate consistent hashes', () => {
    const str = 'hello world';
    const hash1 = hashString(str);
    const hash2 = hashString(str);
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different strings', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should return unsigned 32-bit integer', () => {
    const hash = hashString('test');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xff_ff_ff_ff);
  });
});

describe('combineHashes', () => {
  it('should combine two hashes', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    const combined = combineHashes(hash1, hash2);
    expect(combined).toBeGreaterThanOrEqual(0);
    expect(combined).toBeLessThanOrEqual(0xff_ff_ff_ff);
  });

  it('should be deterministic', () => {
    const hash1 = hashString('foo');
    const hash2 = hashString('bar');
    const combined1 = combineHashes(hash1, hash2);
    const combined2 = combineHashes(hash1, hash2);
    expect(combined1).toBe(combined2);
  });
});
