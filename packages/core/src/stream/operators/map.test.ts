import { describe, it, expect } from 'vitest';
import { map } from './map.ts';
import { fromArray } from '../sources/from-array.ts';
import { fromValue } from '../sources/from-value.ts';
import { collectAll } from '../sinks/collect-all.ts';
import { pipe } from '../pipe.ts';
import type { Subscription } from '../types.ts';

describe('map', () => {
  describe('basic transformation', () => {
    it('should map each value through transformation function', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should handle single value', async () => {
      const source = fromValue(5);

      const result = await pipe(
        source,
        map((x) => x + 10),
        collectAll,
      );

      expect(result).toEqual([15]);
    });

    it('should handle empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([]);
    });

    it('should handle multiple values', async () => {
      const source = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        collectAll,
      );

      expect(result).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });
  });

  describe('type transformation', () => {
    it('should transform number to string', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(source, map(String), collectAll);

      expect(result).toEqual(['1', '2', '3']);
    });

    it('should transform to object', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => ({ value: x })),
        collectAll,
      );

      expect(result).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
    });

    it('should transform to array', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => [x, x * 2]),
        collectAll,
      );

      expect(result).toEqual([
        [1, 2],
        [2, 4],
        [3, 6],
      ]);
    });

    it('should transform object to primitive', async () => {
      const source = fromArray([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await pipe(
        source,
        map((x) => x.id),
        collectAll,
      );

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('chaining', () => {
    it('should chain multiple map operators', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x + 1),
        map((x) => x * 2),
        map((x) => x - 3),
        collectAll,
      );

      expect(result).toEqual([1, 3, 5]);
    });

    it('should chain map with type transformations', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        map(String),
        map((x) => ({ text: x })),
        collectAll,
      );

      expect(result).toEqual([{ text: '2' }, { text: '4' }, { text: '6' }]);
    });
  });

  describe('falsy values', () => {
    it('should handle null values', async () => {
      const source = fromArray<number | null>([1, null, 3]);

      const result = await pipe(
        source,
        map((x) => (x === null ? 0 : x * 2)),
        collectAll,
      );

      expect(result).toEqual([2, 0, 6]);
    });

    it('should handle undefined values', async () => {
      const source = fromArray<number | undefined>([1, undefined, 3]);

      const result = await pipe(
        source,
        map((x) => (x === undefined ? -1 : x * 2)),
        collectAll,
      );

      expect(result).toEqual([2, -1, 6]);
    });

    it('should handle zero', async () => {
      const source = fromArray([0, 1, 2]);

      const result = await pipe(
        source,
        map((x) => x + 10),
        collectAll,
      );

      expect(result).toEqual([10, 11, 12]);
    });

    it('should handle false', async () => {
      const source = fromArray([true, false, true]);

      const result = await pipe(
        source,
        map((x) => !x),
        collectAll,
      );

      expect(result).toEqual([false, true, false]);
    });

    it('should handle empty string', async () => {
      const source = fromArray(['a', '', 'c']);

      const result = await pipe(
        source,
        map((x) => x || 'default'),
        collectAll,
      );

      expect(result).toEqual(['a', 'default', 'c']);
    });
  });

  describe('transformation function behavior', () => {
    it('should call transformation function for each value', async () => {
      const source = fromArray([1, 2, 3]);
      const calls: number[] = [];

      await pipe(
        source,
        map((x) => {
          calls.push(x);
          return x * 2;
        }),
        collectAll,
      );

      expect(calls).toEqual([1, 2, 3]);
    });

    it('should pass exact value to transformation function', async () => {
      const source = fromArray([{ id: 1, name: 'a' }]);

      const result = await pipe(
        source,
        map((x) => x),
        collectAll,
      );

      expect(result).toEqual([{ id: 1, name: 'a' }]);
    });

    it('should support transformation returning same value', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x),
        collectAll,
      );

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('completion', () => {
    it('should complete when source completes', async () => {
      const source = fromArray([1, 2, 3]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([2, 4, 6]);
    });

    it('should complete immediately on empty source', async () => {
      const source = fromArray<number>([]);

      const result = await pipe(
        source,
        map((x) => x * 2),
        collectAll,
      );

      expect(result).toEqual([]);
    });
  });

  describe('subscription', () => {
    it('should provide subscription', () => {
      const source = fromArray([1, 2, 3]);
      const subscription: Subscription;

      subscription = pipe(
        source,
        map((x) => x * 2),
      )({
        next: () => {},
        complete: () => {},
      });

      expect(subscription).not.toBeNull();
      expect(subscription).toHaveProperty('unsubscribe');
    });

    it('should allow cancellation through subscription', () => {
      const source = fromArray([1, 2, 3]);
      const emitted: number[] = [];

      const subscription = pipe(
        source,
        map((x) => x * 2),
      )({
        next: (value) => {
          emitted.push(value);
        },
        complete: () => {},
      });

      subscription.unsubscribe();

      expect(emitted).toEqual([2, 4, 6]);
    });
  });

  describe('complex transformations', () => {
    it('should handle complex object transformations', async () => {
      const source = fromArray([
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
        { id: 3, name: 'Charlie', age: 35 },
      ]);

      const result = await pipe(
        source,
        map((user) => ({ ...user, age: user.age + 1 })),
        collectAll,
      );

      expect(result).toEqual([
        { id: 1, name: 'Alice', age: 31 },
        { id: 2, name: 'Bob', age: 26 },
        { id: 3, name: 'Charlie', age: 36 },
      ]);
    });

    it('should handle nested object transformations', async () => {
      const source = fromArray([
        { user: { id: 1, profile: { name: 'Alice' } } },
        { user: { id: 2, profile: { name: 'Bob' } } },
      ]);

      const result = await pipe(
        source,
        map((data) => data.user.profile.name),
        collectAll,
      );

      expect(result).toEqual(['Alice', 'Bob']);
    });

    it('should handle array transformations', async () => {
      const source = fromArray([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);

      const result = await pipe(
        source,
        map((arr) => arr.reduce((sum, n) => sum + n, 0)),
        collectAll,
      );

      expect(result).toEqual([6, 15, 24]);
    });
  });
});
