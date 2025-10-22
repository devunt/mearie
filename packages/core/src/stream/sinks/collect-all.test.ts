import { describe, it, expect } from 'vitest';
import { collectAll } from './collect-all.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import { filter } from '../operators/filter.ts';

describe('collectAll', () => {
  describe('basic functionality', () => {
    it('should collect all values from source', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should collect single value', async () => {
      const source = fromValue(42);

      const result = await collectAll(source);

      expect(result).toEqual([42]);
    });

    it('should return empty array for empty source', async () => {
      const source = fromArray<number>([]);

      const result = await collectAll(source);

      expect(result).toEqual([]);
    });

    it('should preserve value order', async () => {
      const source = fromArray([5, 4, 3, 2, 1]);

      const result = await collectAll(source);

      expect(result).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe('with operators', () => {
    it('should collect after map', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should collect after filter', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([2, 4]);
    });

    it('should collect after multiple operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x > 2),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([6, 8, 10]);
    });
  });

  describe('value types', () => {
    it('should collect strings', async () => {
      const source = fromArray(['a', 'b', 'c']);

      const result = await collectAll(source);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should collect objects', async () => {
      const source = fromArray([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await collectAll(source);

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('should collect arrays', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);

      const result = await collectAll(source);

      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('should collect mixed types', async () => {
      const source = fromArray<number | string | boolean>([1, 'a', true, 2, 'b', false]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 'a', true, 2, 'b', false]);
    });
  });

  describe('falsy values', () => {
    it('should collect null values', async () => {
      const source = fromArray<number | null>([1, null, 3, null, 5]);

      const result = await collectAll(source);

      expect(result).toEqual([1, null, 3, null, 5]);
    });

    it('should collect undefined values', async () => {
      const source = fromArray<number | undefined>([1, undefined, 3, undefined]);

      const result = await collectAll(source);

      expect(result).toEqual([1, undefined, 3, undefined]);
    });

    it('should collect zero', async () => {
      const source = fromArray([0, 1, 0, 2, 0]);

      const result = await collectAll(source);

      expect(result).toEqual([0, 1, 0, 2, 0]);
    });

    it('should collect false', async () => {
      const source = fromArray([true, false, true, false]);

      const result = await collectAll(source);

      expect(result).toEqual([true, false, true, false]);
    });

    it('should collect empty string', async () => {
      const source = fromArray(['a', '', 'b', '', 'c']);

      const result = await collectAll(source);

      expect(result).toEqual(['a', '', 'b', '', 'c']);
    });
  });

  describe('completion', () => {
    it('should resolve when source completes', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should resolve immediately for empty source', async () => {
      const source = fromArray<number>([]);

      const result = await collectAll(source);

      expect(result).toEqual([]);
    });
  });

  describe('large collections', () => {
    it('should handle large arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const source = fromArray(largeArray);

      const result = await collectAll(source);

      expect(result).toEqual(largeArray);
      expect(result.length).toBe(1000);
    });

    it('should handle very large arrays', async () => {
      const veryLargeArray = Array.from({ length: 10_000 }, (_, i) => i);
      const source = fromArray(veryLargeArray);

      const result = await collectAll(source);

      expect(result.length).toBe(10_000);
      expect(result[0]).toBe(0);
      expect(result[9999]).toBe(9999);
    });
  });

  describe('complex values', () => {
    it('should collect nested objects', async () => {
      const source = fromArray([{ user: { id: 1, name: 'Alice' } }, { user: { id: 2, name: 'Bob' } }]);

      const result = await collectAll(source);

      expect(result).toEqual([{ user: { id: 1, name: 'Alice' } }, { user: { id: 2, name: 'Bob' } }]);
    });

    it('should collect nested arrays', async () => {
      const source = fromArray([
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ]);

      const result = await collectAll(source);

      expect(result).toEqual([
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ]);
    });

    it('should collect with complex transformations', async () => {
      const source = fromArray([
        { id: 1, values: [1, 2, 3] },
        { id: 2, values: [4, 5, 6] },
      ]);

      const result = await pipe(
        source,
        map((item) => ({
          ...item,
          sum: item.values.reduce((a, b) => a + b, 0),
        })),
        collectAll,
      );

      expect(result).toEqual([
        { id: 1, values: [1, 2, 3], sum: 6 },
        { id: 2, values: [4, 5, 6], sum: 15 },
      ]);
    });
  });

  describe('promise behavior', () => {
    it('should return a promise', () => {
      const source = fromArray([1, 2, 3]);

      const result = collectAll(source);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should be awaitable', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collectAll(source);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should allow then chaining', async () => {
      const source = fromArray([1, 2, 3]);

      await collectAll(source).then((result) => {
        expect(result).toEqual([1, 2, 3]);
      });
    });
  });
});
