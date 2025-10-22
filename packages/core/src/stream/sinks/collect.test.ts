import { describe, it, expect } from 'vitest';
import { collect } from './collect.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import { filter } from '../operators/filter.ts';
import type { Sink } from '../types.ts';

describe('collect', () => {
  describe('basic functionality', () => {
    it('should collect last value from source', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await collect(source);

      expect(result).toBe(5);
    });

    it('should collect single value', async () => {
      const source = fromValue(42);

      const result = await collect(source);

      expect(result).toBe(42);
    });

    it('should reject for empty source', async () => {
      const source = fromArray<number>([]);

      await expect(collect(source)).rejects.toThrow('Source completed without emitting any values');
    });

    it('should return last value when multiple values emitted', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collect(source);

      expect(result).toBe(3);
    });
  });

  describe('with operators', () => {
    it('should collect last value after map', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, map((x) => x * 2), collect);

      expect(result).toBe(6);
    });

    it('should collect last value after filter', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collect,
      );

      expect(result).toBe(4);
    });

    it('should collect last value after multiple operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x > 2),
        map((x) => x * 2),
        collect,
      );

      expect(result).toBe(10);
    });

    it('should reject when filter removes all values', async () => {
      const source = fromArray([1, 2, 3]);

      await expect(
        pipe(
          source,
          filter((x) => x > 10),
          collect,
        ),
      ).rejects.toThrow('Source completed without emitting any values');
    });
  });

  describe('value types', () => {
    it('should collect string', async () => {
      const source = fromArray(['a', 'b', 'c']);

      const result = await collect(source);

      expect(result).toBe('c');
    });

    it('should collect object', async () => {
      const source = fromArray([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await collect(source);

      expect(result).toEqual({ id: 3 });
    });

    it('should collect array', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
      ]);

      const result = await collect(source);

      expect(result).toEqual([3, 4]);
    });

    it('should collect boolean', async () => {
      const source = fromArray([true, false, true]);

      const result = await collect(source);

      expect(result).toBe(true);
    });
  });

  describe('falsy values', () => {
    it('should collect null as last value', async () => {
      const source = fromArray<number | null>([1, 2, null]);

      const result = await collect(source);

      expect(result).toBeNull();
    });

    it('should collect null when it is only value', async () => {
      const source = fromValue(null);

      const result = await collect(source);

      expect(result).toBeNull();
    });

    it('should collect undefined as last value', async () => {
      const source = fromArray<number | undefined>([1, 2, undefined]);

      const result = await collect(source);

      expect(result).toBeUndefined();
    });

    it('should collect zero as last value', async () => {
      const source = fromArray([1, 2, 0]);

      const result = await collect(source);

      expect(result).toBe(0);
    });

    it('should collect zero when it is only value', async () => {
      const source = fromValue(0);

      const result = await collect(source);

      expect(result).toBe(0);
    });

    it('should collect false as last value', async () => {
      const source = fromArray([true, true, false]);

      const result = await collect(source);

      expect(result).toBe(false);
    });

    it('should collect false when it is only value', async () => {
      const source = fromValue(false);

      const result = await collect(source);

      expect(result).toBe(false);
    });

    it('should collect empty string as last value', async () => {
      const source = fromArray(['a', 'b', '']);

      const result = await collect(source);

      expect(result).toBe('');
    });

    it('should collect empty string when it is only value', async () => {
      const source = fromValue('');

      const result = await collect(source);

      expect(result).toBe('');
    });
  });

  describe('error handling', () => {
    it('should reject on source error', async () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.next(1);
        sink.next(2);
        sink.error(new Error('Source error'));
      };

      await expect(collect(source)).rejects.toThrow('Source error');
    });

    it('should reject on error before any values', async () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.error(new Error('Early error'));
      };

      await expect(collect(source)).rejects.toThrow('Early error');
    });

    it('should reject for empty source with specific message', async () => {
      const source = fromArray<number>([]);

      await expect(collect(source)).rejects.toThrow('Source completed without emitting any values');
    });
  });

  describe('completion', () => {
    it('should resolve when source completes', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collect(source);

      expect(result).toBe(3);
    });

    it('should resolve with last value immediately after completion', async () => {
      const source = fromValue(42);

      const result = await collect(source);

      expect(result).toBe(42);
    });
  });

  describe('overwriting behavior', () => {
    it('should overwrite previous values', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await collect(source);

      expect(result).toBe(5);
      expect(result).not.toBe(1);
      expect(result).not.toBe(2);
      expect(result).not.toBe(3);
      expect(result).not.toBe(4);
    });

    it('should keep updating until completion', async () => {
      const source = fromArray([10, 20, 30, 40, 50]);

      const result = await collect(source);

      expect(result).toBe(50);
    });
  });

  describe('large sources', () => {
    it('should handle large number of values', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const source = fromArray(largeArray);

      const result = await collect(source);

      expect(result).toBe(999);
    });

    it('should handle very large number of values', async () => {
      const veryLargeArray = Array.from({ length: 10_000 }, (_, i) => i);
      const source = fromArray(veryLargeArray);

      const result = await collect(source);

      expect(result).toBe(9999);
    });
  });

  describe('complex values', () => {
    it('should collect last complex object', async () => {
      const source = fromArray([
        { user: { id: 1, name: 'Alice' } },
        { user: { id: 2, name: 'Bob' } },
        { user: { id: 3, name: 'Charlie' } },
      ]);

      const result = await collect(source);

      expect(result).toEqual({ user: { id: 3, name: 'Charlie' } });
    });

    it('should collect last nested array', async () => {
      const source = fromArray([
        [[1, 2], [3, 4]],
        [[5, 6], [7, 8]],
        [[9, 10], [11, 12]],
      ]);

      const result = await collect(source);

      expect(result).toEqual([[9, 10], [11, 12]]);
    });
  });

  describe('promise behavior', () => {
    it('should return a promise', () => {
      const source = fromArray([1, 2, 3]);

      const result = collect(source);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should be awaitable', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collect(source);

      expect(typeof result).toBe('number');
    });

    it('should allow then chaining', async () => {
      const source = fromArray([1, 2, 3]);

      await collect(source).then((result) => {
        expect(result).toBe(3);
      });
    });

    it('should allow catch for errors', async () => {
      const source = (sink: Sink<number>) => {
        sink.start({
          pull: () => {},
          cancel: () => {},
        });
        sink.error(new Error('Test error'));
      };

      await expect(collect(source)).rejects.toThrow('Test error');
    });
  });

  describe('use cases', () => {
    it('should be useful for getting final result', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        filter((x) => x > 5),
        collect,
      );

      expect(result).toBe(10);
    });

    it('should be useful for reduction-like operations', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      let sum = 0;

      const result = await pipe(
        source,
        map((x) => {
          sum += x;
          return sum;
        }),
        collect,
      );

      expect(result).toBe(15);
    });
  });
});
