import { describe, it, expect } from 'vitest';
import { mergeMap } from './merge-map.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';

describe('mergeMap', () => {
  describe('basic functionality', () => {
    it('should map each value to a source and flatten', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x * 2])),
        collectAll,
      );

      expect(result.toSorted()).toEqual([1, 2, 2, 3, 4, 6]);
    });

    it('should handle single value source', async () => {
      const source = fromValue(5);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x + 1, x + 2])),
        collectAll,
      );

      expect(result).toEqual([5, 6, 7]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x * 2])),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle mapping to empty sources', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap(() => fromArray<number>([])),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle mapping to single value sources', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x * 2)),
        collectAll,
      );

      expect(result.toSorted()).toEqual([2, 4, 6]);
    });
  });

  describe('flattening behavior', () => {
    it('should flatten multiple inner sources concurrently', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x * 10, x * 10 + 1])),
        collectAll,
      );

      expect(result.toSorted()).toEqual([10, 11, 20, 21, 30, 31]);
    });

    it('should merge values from all inner sources', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x + 10, x + 20])),
        collectAll,
      );

      expect(result.toSorted((a, b) => a - b)).toEqual([1, 2, 11, 12, 21, 22]);
    });

    it('should handle different length inner sources', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => (x === 2 ? fromArray([x, x + 1, x + 2]) : fromValue(x))),
        collectAll,
      );

      expect(result.toSorted()).toEqual([1, 2, 3, 3, 4]);
    });
  });

  describe('type transformation', () => {
    it('should transform types through inner sources', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(String(x))),
        collectAll,
      );

      expect(result.toSorted()).toEqual(['1', '2', '3']);
    });

    it('should transform to objects', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([{ id: x }, { id: x + 10 }])),
        collectAll,
      );

      expect(result.length).toBe(4);
      expect(result.map((x) => x.id).toSorted((a, b) => a - b)).toEqual([1, 2, 11, 12]);
    });

    it('should transform to arrays', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue([x, x * 2])),
        collectAll,
      );

      expect(result.length).toBe(2);
      expect(result.flat().toSorted()).toEqual([1, 2, 2, 4]);
    });
  });

  describe('chaining', () => {
    it('should work with map operator before', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        mergeMap((x) => fromArray([x, x * 2])),
        collectAll,
      );

      expect(result.toSorted()).toEqual([2, 3, 4, 4, 6, 8]);
    });

    it('should work with map operator after', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x + 1])),
        map((x) => x * 2),
        collectAll,
      );

      expect(result.toSorted()).toEqual([2, 4, 4, 6, 6, 8]);
    });

    it('should chain multiple mergeMap operators', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x + 1])),
        mergeMap((x) => fromArray([x * 10])),
        collectAll,
      );

      expect(result.toSorted()).toEqual([10, 20, 20, 30]);
    });
  });

  describe('completion', () => {
    it('should complete when outer source completes and all inner sources complete', () => {
      const source = fromArray([1, 2, 3]);

      let completed = false;

      pipe(
        source,
        mergeMap((x) => fromValue(x)),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should not complete until all inner sources complete', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([x, x + 1, x + 2])),
        collectAll,
      );

      expect(result.length).toBe(6);
    });

    it('should complete immediately on empty source', () => {
      const source = fromArray<number>([]);

      let completed = false;

      pipe(
        source,
        mergeMap((x) => fromValue(x)),
      )({
        start: (tb) => {
          tb.pull();
        },
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('falsy values', () => {
    it('should handle null values from outer source', async () => {
      const source = fromArray<number | null>([null, 1, null]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.filter((x) => x === null)).toHaveLength(2);
      expect(result.filter((x) => x === 1)).toHaveLength(1);
    });

    it('should handle null values from inner sources', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap(() => fromArray<number | null>([null, null])),
        collectAll,
      );

      expect(result).toEqual([null, null, null, null]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([undefined, 1, undefined]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.filter((x) => x === undefined)).toHaveLength(2);
    });

    it('should handle zero', async () => {
      const source = fromArray([0, 1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.toSorted()).toEqual([0, 1, 2]);
    });

    it('should handle false', async () => {
      const source = fromArray([false, true]);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.filter((x) => x === false)).toHaveLength(1);
      expect(result.filter((x) => x === true)).toHaveLength(1);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['', 'a', '']);

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.filter((x) => x === '')).toHaveLength(2);
    });
  });

  describe('complex scenarios', () => {
    it('should flatten nested arrays', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);

      const result = await pipe(
        source,
        mergeMap((arr) => fromArray(arr)),
        collectAll,
      );

      expect(result.toSorted()).toEqual([1, 2, 3, 4]);
    });

    it('should handle objects in inner sources', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray([{ value: x }, { value: x * 2 }])),
        collectAll,
      );

      expect(result.length).toBe(4);
      expect(result.map((x) => x.value).toSorted()).toEqual([1, 2, 2, 4]);
    });

    it('should handle many inner sources', async () => {
      const source = fromArray(Array.from({ length: 10 }, (_, i) => i + 1));

      const result = await pipe(
        source,
        mergeMap((x) => fromValue(x)),
        collectAll,
      );

      expect(result.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should handle large inner sources', async () => {
      const source = fromArray([1, 2]);

      const result = await pipe(
        source,
        mergeMap((x) => fromArray(Array.from({ length: 100 }, (_, i) => x * 100 + i))),
        collectAll,
      );

      expect(result.length).toBe(200);
    });
  });

  describe('use cases', () => {
    it('should be useful for expanding values', async () => {
      const source = fromArray(['a', 'b']);

      const result = await pipe(
        source,
        mergeMap((letter) => fromArray([letter, letter.toUpperCase()])),
        collectAll,
      );

      expect(result.toSorted()).toEqual(['A', 'B', 'a', 'b']);
    });

    it('should be useful for conditional expansion', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        mergeMap((x) => (x % 2 === 0 ? fromArray([x, x * 2]) : fromValue(x))),
        collectAll,
      );

      expect(result.toSorted()).toEqual([1, 2, 3, 4, 4, 5, 8]);
    });

    it('should be useful for data transformation pipelines', async () => {
      const source = fromArray([
        { id: 1, tags: ['a', 'b'] },
        { id: 2, tags: ['c'] },
      ]);

      const result = await pipe(
        source,
        mergeMap((item) => fromArray(item.tags.map((tag) => ({ id: item.id, tag })))),
        collectAll,
      );

      expect(result).toEqual([
        { id: 1, tag: 'a' },
        { id: 1, tag: 'b' },
        { id: 2, tag: 'c' },
      ]);
    });
  });
});
