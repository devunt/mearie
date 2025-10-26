import { describe, it, expect } from 'vitest';
import { fromArray } from './from-array.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from '../operators/map.ts';
import { filter } from '../operators/filter.ts';

describe('fromArray', () => {
  describe('basic functionality', () => {
    it('should emit all values from array', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should emit single value', async () => {
      const source = fromArray([42]);

      const result = await collectAll(source);

      expect(result).toEqual([42]);
    });

    it('should handle empty array', async () => {
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

  describe('value types', () => {
    it('should emit numbers', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should emit strings', async () => {
      const source = fromArray(['a', 'b', 'c']);

      const result = await collectAll(source);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should emit objects', async () => {
      const source = fromArray([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await collectAll(source);

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('should emit arrays', async () => {
      const source = fromArray([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      const result = await collectAll(source);

      expect(result).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    it('should emit booleans', async () => {
      const source = fromArray([true, false, true]);

      const result = await collectAll(source);

      expect(result).toEqual([true, false, true]);
    });

    it('should emit mixed types', async () => {
      const source = fromArray<number | string | boolean>([1, 'a', true, 2, 'b', false]);

      const result = await collectAll(source);

      expect(result).toEqual([1, 'a', true, 2, 'b', false]);
    });
  });

  describe('falsy values', () => {
    it('should emit null values', async () => {
      const source = fromArray<number | null>([1, null, 3, null, 5]);

      const result = await collectAll(source);

      expect(result).toEqual([1, null, 3, null, 5]);
    });

    it('should emit undefined values', async () => {
      const source = fromArray<number | undefined>([1, undefined, 3, undefined]);

      const result = await collectAll(source);

      expect(result).toEqual([1, undefined, 3, undefined]);
    });

    it('should emit zero', async () => {
      const source = fromArray([0, 1, 0, 2, 0]);

      const result = await collectAll(source);

      expect(result).toEqual([0, 1, 0, 2, 0]);
    });

    it('should emit false', async () => {
      const source = fromArray([true, false, true, false]);

      const result = await collectAll(source);

      expect(result).toEqual([true, false, true, false]);
    });

    it('should emit empty string', async () => {
      const source = fromArray(['a', '', 'b', '', 'c']);

      const result = await collectAll(source);

      expect(result).toEqual(['a', '', 'b', '', 'c']);
    });

    it('should emit array of only null', async () => {
      const source = fromArray([null, null, null]);

      const result = await collectAll(source);

      expect(result).toEqual([null, null, null]);
    });

    it('should emit array of only zero', async () => {
      const source = fromArray([0, 0, 0]);

      const result = await collectAll(source);

      expect(result).toEqual([0, 0, 0]);
    });

    it('should emit array of only false', async () => {
      const source = fromArray([false, false, false]);

      const result = await collectAll(source);

      expect(result).toEqual([false, false, false]);
    });
  });

  describe('with operators', () => {
    it('should work with map', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should work with filter', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([2, 4]);
    });

    it('should work with multiple operators', async () => {
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

  describe('completion', () => {
    it('should complete after emitting all values', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should complete immediately for empty array', () => {
      const source = fromArray<number>([]);
      let completed = false;

      source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });
  });

  describe('cancellation', () => {
    it('should support unsubscribe after completion', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([1, 2, 3, 4, 5]);

      expect(() => subscription.unsubscribe()).not.toThrow();
    });

    it('should allow cancellation before subscription (no effect on synchronous source)', () => {
      const source = fromArray([1, 2, 3, 4, 5]);
      const emitted: number[] = [];

      const subscription = source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      expect(emitted).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not throw when calling unsubscribe multiple times', () => {
      const source = fromArray([1, 2, 3]);

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(() => {
        subscription.unsubscribe();
        subscription.unsubscribe();
      }).not.toThrow();
    });
  });

  describe('subscription', () => {
    it('should return subscription', () => {
      const source = fromArray([1, 2, 3]);

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });

    it('should have unsubscribe method that does not throw', () => {
      const source = fromArray([1, 2, 3]);

      const subscription = source({
        next: () => {},
        complete: () => {},
      });

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('large arrays', () => {
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

    it('should handle arrays with complex objects', async () => {
      const complexArray = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: { value: i * 2, nested: { deep: i * 3 } },
      }));
      const source = fromArray(complexArray);

      const result = await collectAll(source);

      expect(result.length).toBe(100);
      expect(result[0]).toEqual({
        id: 0,
        data: { value: 0, nested: { deep: 0 } },
      });
      expect(result[99]).toEqual({
        id: 99,
        data: { value: 198, nested: { deep: 297 } },
      });
    });
  });

  describe('nested structures', () => {
    it('should emit nested objects', async () => {
      const source = fromArray([
        { user: { id: 1, profile: { name: 'Alice' } } },
        { user: { id: 2, profile: { name: 'Bob' } } },
      ]);

      const result = await collectAll(source);

      expect(result).toEqual([
        { user: { id: 1, profile: { name: 'Alice' } } },
        { user: { id: 2, profile: { name: 'Bob' } } },
      ]);
    });

    it('should emit nested arrays', async () => {
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

    it('should emit deeply nested structures', async () => {
      const source = fromArray([{ a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 2 } } } }]);

      const result = await collectAll(source);

      expect(result).toEqual([{ a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 2 } } } }]);
    });
  });

  describe('synchronous behavior', () => {
    it('should emit values synchronously', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];

      source({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([1, 2, 3]);
    });

    it('should complete synchronously', () => {
      const source = fromArray([1, 2, 3]);
      let completed = false;

      source({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      expect(completed).toBe(true);
    });

    it('should emit all values before completing', () => {
      const source = fromArray([1, 2, 3]);
      const events: string[] = [];

      source({
        next: (value) => {
          events.push(`next:${value}`);
        },
        complete: () => {
          events.push('complete');
        },
      });

      expect(events).toEqual(['next:1', 'next:2', 'next:3', 'complete']);
    });
  });

  describe('edge cases', () => {
    it('should handle array with undefined', async () => {
      const source = fromArray([undefined]);

      const result = await collectAll(source);

      expect(result).toEqual([undefined]);
    });

    it('should handle array with null', async () => {
      const source = fromArray([null]);

      const result = await collectAll(source);

      expect(result).toEqual([null]);
    });

    it('should handle array with NaN', async () => {
      const source = fromArray([Number.NaN]);

      const result = await collectAll(source);

      expect(result[0]).toBeNaN();
    });

    it('should handle array with Infinity', async () => {
      const source = fromArray([Infinity, -Infinity]);

      const result = await collectAll(source);

      expect(result).toEqual([Infinity, -Infinity]);
    });
  });
});
