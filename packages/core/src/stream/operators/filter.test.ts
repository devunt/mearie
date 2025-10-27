import { describe, it, expect } from 'vitest';
import { filter } from './filter.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import { map } from './map.ts';

describe('filter', () => {
  describe('basic filtering', () => {
    it('should filter values based on predicate', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([2, 4]);
    });

    it('should pass through all values when predicate is always true', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        filter(() => true),
        collectAll,
      );

      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter out all values when predicate is always false', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        filter(() => false),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle single value matching predicate', async () => {
      const source = fromValue(4);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([4]);
    });

    it('should handle single value not matching predicate', async () => {
      const source = fromValue(3);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        filter((x) => x > 0),
        collectAll,
      );

      expect(result).toEqual([]);
    });
  });

  describe('predicate types', () => {
    it('should filter numbers by comparison', async () => {
      const source = fromArray([1, 5, 10, 15, 20]);

      const result = await pipe(
        source,
        filter((x) => x > 10),
        collectAll,
      );

      expect(result).toEqual([15, 20]);
    });

    it('should filter strings by length', async () => {
      const source = fromArray(['a', 'ab', 'abc', 'abcd']);

      const result = await pipe(
        source,
        filter((x) => x.length > 2),
        collectAll,
      );

      expect(result).toEqual(['abc', 'abcd']);
    });

    it('should filter objects by property', async () => {
      const source = fromArray([
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ]);

      const result = await pipe(
        source,
        filter((x) => x.active),
        collectAll,
      );

      expect(result).toEqual([
        { id: 1, active: true },
        { id: 3, active: true },
      ]);
    });

    it('should filter by type guard', async () => {
      const source = fromArray<string | number>(['a', 1, 'b', 2, 'c']);

      const result = await pipe(
        source,
        filter((x): x is string => typeof x === 'string'),
        collectAll,
      );

      expect(result).toEqual(['a', 'b', 'c']);
    });
  });

  describe('chaining', () => {
    it('should chain multiple filter operators', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await pipe(
        source,
        filter((x) => x > 3),
        filter((x) => x < 8),
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([4, 6]);
    });

    it('should chain filter with map', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([4, 8]);
    });

    it('should chain map with filter', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        filter((x) => x > 5),
        collectAll,
      );

      expect(result).toEqual([6, 8, 10]);
    });
  });

  describe('falsy values', () => {
    it('should handle null values in predicate', async () => {
      const source = fromArray<number | null>([1, null, 3, null, 5]);

      const result = await pipe(
        source,
        filter((x) => x !== null),
        collectAll,
      );

      expect(result).toEqual([1, 3, 5]);
    });

    it('should filter null values', async () => {
      const source = fromArray<number | null>([1, null, 3]);

      const result = await pipe(
        source,
        filter((x) => x === null),
        collectAll,
      );

      expect(result).toEqual([null]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([1, undefined, 3]);

      const result = await pipe(
        source,
        filter((x) => x !== undefined),
        collectAll,
      );

      expect(result).toEqual([1, 3]);
    });

    it('should handle zero as valid value', async () => {
      const source = fromArray([0, 1, 2, 3]);

      const result = await pipe(
        source,
        filter((x) => x >= 0),
        collectAll,
      );

      expect(result).toEqual([0, 1, 2, 3]);
    });

    it('should filter by zero', async () => {
      const source = fromArray([0, 1, 0, 2, 0]);

      const result = await pipe(
        source,
        filter((x) => x === 0),
        collectAll,
      );

      expect(result).toEqual([0, 0, 0]);
    });

    it('should handle false as valid value', async () => {
      const source = fromArray([true, false, true]);

      const result = await pipe(
        source,
        filter((x) => x === false),
        collectAll,
      );

      expect(result).toEqual([false]);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['a', '', 'b', '']);

      const result = await pipe(
        source,
        filter((x) => x !== ''),
        collectAll,
      );

      expect(result).toEqual(['a', 'b']);
    });

    it('should filter by empty string', async () => {
      const source = fromArray(['a', '', 'b']);

      const result = await pipe(
        source,
        filter((x) => x === ''),
        collectAll,
      );

      expect(result).toEqual(['']);
    });
  });

  describe('predicate behavior', () => {
    it('should call predicate for each value', async () => {
      const source = fromArray([1, 2, 3]);
      const calls: number[] = [];

      await pipe(
        source,
        filter((x) => {
          calls.push(x);
          return x % 2 === 0;
        }),
        collectAll,
      );

      expect(calls).toEqual([1, 2, 3]);
    });

    it('should not call predicate for values after completion', async () => {
      const source = fromArray([1, 2, 3]);
      const calls: number[] = [];

      await pipe(
        source,
        filter((x) => {
          calls.push(x);
          return true;
        }),
        collectAll,
      );

      expect(calls).toEqual([1, 2, 3]);
    });

    it('should pass exact value to predicate', async () => {
      const source = fromArray([{ id: 1, value: 'a' }]);
      let receivedValue: { id: number; value: string } | null = null;

      await pipe(
        source,
        filter((x) => {
          receivedValue = x;
          return true;
        }),
        collectAll,
      );

      expect(receivedValue).toEqual({ id: 1, value: 'a' });
    });
  });

  describe('completion', () => {
    it('should complete when source completes', async () => {
      const source = fromArray([1, 2, 3, 4, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([2, 4]);
    });

    it('should complete immediately on empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        filter((x) => x > 0),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should complete when all values filtered out', async () => {
      const source = fromArray([1, 3, 5]);

      const result = await pipe(
        source,
        filter((x) => x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([]);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', () => {
      const source = fromArray([1, 2, 3]);
      const subscription = pipe(
        source,
        filter((x) => x > 0),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });

    it('should allow cancellation through subscription', () => {
      const source = fromArray([2, 4, 6, 8]);
      const emitted: number[] = [];

      const subscription = pipe(
        source,
        filter((x) => x % 2 === 0),
      )({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      expect(emitted).toEqual([2, 4, 6, 8]);
      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('complex predicates', () => {
    it('should filter with complex object predicates', async () => {
      const source = fromArray([
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
        { id: 3, name: 'Charlie', age: 35 },
      ]);

      const result = await pipe(
        source,
        filter((user) => user.age >= 30),
        collectAll,
      );

      expect(result).toEqual([
        { id: 1, name: 'Alice', age: 30 },
        { id: 3, name: 'Charlie', age: 35 },
      ]);
    });

    it('should filter with multiple conditions', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await pipe(
        source,
        filter((x) => x > 3 && x < 8 && x % 2 === 0),
        collectAll,
      );

      expect(result).toEqual([4, 6]);
    });

    it('should filter with nested property access', async () => {
      const source = fromArray([
        { user: { profile: { age: 20 } } },
        { user: { profile: { age: 30 } } },
        { user: { profile: { age: 40 } } },
      ]);

      const result = await pipe(
        source,
        filter((data) => data.user.profile.age >= 30),
        collectAll,
      );

      expect(result).toEqual([{ user: { profile: { age: 30 } } }, { user: { profile: { age: 40 } } }]);
    });

    it('should filter arrays by length', async () => {
      const source = fromArray([[1, 2], [1, 2, 3], [1], [1, 2, 3, 4]]);

      const result = await pipe(
        source,
        filter((arr) => arr.length > 2),
        collectAll,
      );

      expect(result).toEqual([
        [1, 2, 3],
        [1, 2, 3, 4],
      ]);
    });
  });
});
