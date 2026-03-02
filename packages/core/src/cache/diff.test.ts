import { describe, it, expect } from 'vitest';
import { findCommonBounds, computeSwaps } from './diff.ts';

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
});
